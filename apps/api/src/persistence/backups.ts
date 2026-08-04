import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { ZipFile } from 'yazl';
import {
  workspaceBackupFormat,
  workspaceBackupVersion,
  type WorkspaceBackupManifest
} from './backup-format.js';
import type { MigrationState } from './migrations.js';
import type { DataPaths } from './paths.js';

const automaticBackupSuffix = '.sqlite';
export type AutomaticBackupKind = 'pre-migration' | 'pre-restore';

export interface VerifiedBackup {
  databasePath: string;
  manifestPath: string;
  createdAt: string;
}

export interface WorkspaceBackup {
  archive: Buffer;
  filename: string;
  manifest: WorkspaceBackupManifest;
}

export interface CreateWorkspaceBackupOptions {
  migrationState: MigrationState;
  applicationVersion: string;
  workspace?: { id: string; name: string } | null;
  now?: Date;
}

export async function createVerifiedBackup(
  sqlite: Database.Database,
  paths: DataPaths,
  now = new Date(),
  kind: AutomaticBackupKind = 'pre-migration'
): Promise<VerifiedBackup> {
  const createdAt = now.toISOString();
  const filename = `${kind}-${createdAt.replaceAll(':', '-').replaceAll('.', '-')}-${randomUUID()}${automaticBackupSuffix}`;
  const databasePath = join(paths.backupsDirectory, filename);
  const manifestPath = `${databasePath}.manifest.json`;

  await sqlite.backup(databasePath);

  const backup = new Database(databasePath, { readonly: true });
  try {
    const quickCheck = backup.pragma('quick_check', { simple: true });
    if (quickCheck !== 'ok') {
      throw new Error(`Backup integrity check failed: ${String(quickCheck)}`);
    }
  } finally {
    backup.close();
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify({ createdAt, databaseFilename: filename, kind }, null, 2)}\n`,
    'utf8'
  );

  return { databasePath, manifestPath, createdAt };
}

export async function createWorkspaceBackup(
  sqlite: Database.Database,
  paths: DataPaths,
  {
    migrationState,
    applicationVersion,
    workspace = null,
    now = new Date()
  }: CreateWorkspaceBackupOptions
): Promise<WorkspaceBackup> {
  const createdAt = now.toISOString();
  const stagingDirectory = await mkdtemp(join(paths.exportsDirectory, '.workspace-backup-'));
  const snapshotPath = join(stagingDirectory, 'workspace.sqlite');

  try {
    await sqlite.backup(snapshotPath);
    verifySnapshot(snapshotPath);

    const snapshot = await readFile(snapshotPath);
    const manifest: WorkspaceBackupManifest = {
      format: workspaceBackupFormat,
      version: workspaceBackupVersion,
      createdAt,
      applicationVersion,
      database: {
        filename: 'workspace.sqlite',
        bytes: snapshot.byteLength,
        sha256: createHash('sha256').update(snapshot).digest('hex'),
        migrations: {
          appliedCount: migrationState.appliedCount,
          totalCount: migrationState.totalCount
        }
      },
      workspace
    };
    const manifestPath = join(stagingDirectory, 'manifest.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    return {
      archive: await createZipArchive(manifestPath, snapshotPath, now),
      filename: `ProjectManagerWorkspace-${createdAt.replaceAll(':', '-').replaceAll('.', '-')}-${randomUUID()}.pmdbackup`,
      manifest
    };
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

export async function pruneAutomaticBackups(paths: DataPaths, maximumCount = 10): Promise<void> {
  const entries = await readdir(paths.backupsDirectory, { withFileTypes: true });
  const automaticBackups = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith('pre-migration-') &&
        entry.name.endsWith(automaticBackupSuffix)
    )
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  await Promise.all(
    automaticBackups
      .slice(maximumCount)
      .flatMap((filename) => [
        unlink(join(paths.backupsDirectory, filename)),
        unlink(join(paths.backupsDirectory, `${filename}.manifest.json`)).catch(() => undefined)
      ])
  );
}

function verifySnapshot(snapshotPath: string): void {
  const snapshot = new Database(snapshotPath, { readonly: true });
  try {
    const quickCheck = snapshot.pragma('quick_check', { simple: true });
    if (quickCheck !== 'ok') {
      throw new Error(`Workspace backup integrity check failed: ${String(quickCheck)}`);
    }
    const foreignKeyViolations = snapshot.pragma('foreign_key_check') as unknown[];
    if (foreignKeyViolations.length > 0) {
      throw new Error(
        `Workspace backup foreign-key check found ${foreignKeyViolations.length} violation(s).`
      );
    }
  } finally {
    snapshot.close();
  }
}

async function createZipArchive(
  manifestPath: string,
  snapshotPath: string,
  now: Date
): Promise<Buffer> {
  const zip = new ZipFile();
  zip.addFile(manifestPath, 'manifest.json', { compress: true, mtime: now });
  zip.addFile(snapshotPath, 'workspace.sqlite', { compress: false, mtime: now });
  zip.end();

  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const archive = Buffer.concat(chunks);
  if (archive.byteLength === 0 || (await stat(snapshotPath)).size === 0) {
    throw new Error('Workspace backup archive was unexpectedly empty.');
  }
  return archive;
}
