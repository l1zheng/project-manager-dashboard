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
export const automaticBackupKinds: readonly AutomaticBackupKind[] = [
  'pre-migration',
  'pre-restore'
];

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

export interface AutomaticBackupRetentionReport {
  retained: Record<AutomaticBackupKind, number>;
  deleted: string[];
  missingManifests: string[];
  failures: Array<{ filename: string; operation: 'database' | 'manifest'; message: string }>;
}

export interface LatestAutomaticBackup {
  kind: AutomaticBackupKind;
  createdAt: string;
  bytes: number;
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

export async function pruneAutomaticBackups(
  paths: DataPaths,
  maximumCount = 10
): Promise<AutomaticBackupRetentionReport> {
  if (!Number.isSafeInteger(maximumCount) || maximumCount < 0) {
    throw new RangeError('Automatic backup retention count must be a non-negative safe integer.');
  }

  const entries = await readdir(paths.backupsDirectory, { withFileTypes: true });
  const report: AutomaticBackupRetentionReport = {
    retained: { 'pre-migration': 0, 'pre-restore': 0 },
    deleted: [],
    missingManifests: [],
    failures: []
  };

  for (const kind of automaticBackupKinds) {
    const automaticBackups = entries
      .filter((entry) => entry.isFile() && isAutomaticBackupFilename(entry.name, kind))
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left));
    report.retained[kind] = automaticBackups.length;

    for (const filename of automaticBackups.slice(maximumCount)) {
      const databasePath = join(paths.backupsDirectory, filename);
      const manifestPath = `${databasePath}.manifest.json`;
      try {
        await unlink(databasePath);
        report.deleted.push(filename);
        report.retained[kind] -= 1;
      } catch (error) {
        report.failures.push({
          filename,
          operation: 'database',
          message: retentionFailureMessage(error)
        });
        continue;
      }

      try {
        await unlink(manifestPath);
      } catch (error) {
        if (isMissingFileError(error)) {
          report.missingManifests.push(`${filename}.manifest.json`);
        } else {
          report.failures.push({
            filename: `${filename}.manifest.json`,
            operation: 'manifest',
            message: retentionFailureMessage(error)
          });
        }
      }
    }
  }

  return report;
}

export async function findLatestVerifiedAutomaticBackup(
  paths: DataPaths
): Promise<LatestAutomaticBackup | undefined> {
  const entries = await readdir(paths.backupsDirectory, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile())
    .flatMap((entry) =>
      automaticBackupKinds.flatMap((kind) =>
        isAutomaticBackupFilename(entry.name, kind) ? [{ filename: entry.name, kind }] : []
      )
    )
    .sort((left, right) => right.filename.localeCompare(left.filename));

  for (const candidate of candidates) {
    const databasePath = join(paths.backupsDirectory, candidate.filename);
    const manifestPath = `${databasePath}.manifest.json`;
    try {
      const [details, manifestFile] = await Promise.all([
        stat(databasePath),
        readFile(manifestPath, 'utf8')
      ]);
      const manifest = JSON.parse(manifestFile) as {
        createdAt?: unknown;
        databaseFilename?: unknown;
        kind?: unknown;
      };
      if (
        !details.isFile() ||
        details.size <= 0 ||
        typeof manifest.createdAt !== 'string' ||
        manifest.databaseFilename !== candidate.filename ||
        manifest.kind !== candidate.kind
      ) {
        continue;
      }
      verifySnapshot(databasePath);
      return { kind: candidate.kind, createdAt: manifest.createdAt, bytes: details.size };
    } catch {
      // Diagnostics deliberately skips incomplete or invalid automatic snapshots.
    }
  }
  return undefined;
}

function isAutomaticBackupFilename(filename: string, kind: AutomaticBackupKind): boolean {
  const escapedKind = kind.replace('-', '\\-');
  return new RegExp(
    `^${escapedKind}-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\${automaticBackupSuffix}$`,
    'i'
  ).test(filename);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function retentionFailureMessage(error: unknown): string {
  return (error instanceof Error ? error.message : 'Unknown retention failure.').slice(0, 500);
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
