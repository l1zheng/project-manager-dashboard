import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import * as yauzl from 'yauzl';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspaceBackup, pruneAutomaticBackups } from './backups.js';
import { openPersistence } from './database.js';
import { resolveDataPaths } from './paths.js';
import * as schema from './schema.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe('workspace backups', () => {
  it('creates a verified ZIP backup with an exact manifest and SQLite snapshot', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'project-manager-workspace-backup-'));
    temporaryRoots.push(rootDirectory);
    const paths = resolveDataPaths({ environment: { PM_DATA_DIR: rootDirectory } });
    const persistence = await openPersistence({ dataPaths: paths });
    const createdAt = new Date('2026-08-04T08:00:00.000Z');
    persistence.db
      .insert(schema.workspaces)
      .values({
        id: 'workspace-1',
        name: '中文项目工作区',
        createdAt,
        updatedAt: createdAt
      })
      .run();
    persistence.db
      .insert(schema.databases)
      .values({
        id: 'database-1',
        workspaceId: 'workspace-1',
        name: '需求跟踪',
        sortOrder: 1000,
        createdAt,
        updatedAt: createdAt
      })
      .run();

    try {
      const backup = await createWorkspaceBackup(persistence.sqlite, paths, {
        migrationState: persistence.migrationState,
        applicationVersion: '0.1.0-test',
        workspace: { id: 'workspace-1', name: '中文项目工作区' },
        now: createdAt
      });

      expect(backup.filename).toMatch(/^ProjectManagerWorkspace-.*\.pmdbackup$/);
      expect(backup.archive.subarray(0, 2).toString()).toBe('PK');
      expect(backup.manifest).toMatchObject({
        format: 'project-manager-workspace-backup',
        version: 1,
        createdAt: '2026-08-04T08:00:00.000Z',
        applicationVersion: '0.1.0-test',
        database: { filename: 'workspace.sqlite', migrations: { appliedCount: 1, totalCount: 1 } },
        workspace: { id: 'workspace-1', name: '中文项目工作区' }
      });

      const entries = await readZipEntries(backup.archive);
      expect(Object.keys(entries).sort()).toEqual(['manifest.json', 'workspace.sqlite']);
      const manifest = JSON.parse(
        entries['manifest.json']!.toString('utf8')
      ) as typeof backup.manifest;
      expect(manifest).toEqual(backup.manifest);
      expect(manifest.database.bytes).toBe(entries['workspace.sqlite']!.byteLength);
      expect(manifest.database.sha256).toBe(
        createHash('sha256').update(entries['workspace.sqlite']!).digest('hex')
      );

      const extractedSnapshotPath = join(rootDirectory, 'verified-workspace.sqlite');
      await writeFile(extractedSnapshotPath, entries['workspace.sqlite']!);
      const snapshot = new Database(extractedSnapshotPath, { readonly: true });
      try {
        expect(snapshot.pragma('quick_check', { simple: true })).toBe('ok');
        expect(snapshot.pragma('foreign_key_check')).toEqual([]);
        expect(
          snapshot.prepare('SELECT name FROM databases WHERE id = ?').get('database-1')
        ).toEqual({ name: '需求跟踪' });
      } finally {
        snapshot.close();
      }
      expect(await readdir(paths.exportsDirectory)).toEqual([]);
    } finally {
      persistence.close();
    }
  });

  it('retains the newest ten backups independently for migration and restore groups', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'project-manager-backup-retention-'));
    temporaryRoots.push(rootDirectory);
    const paths = resolveDataPaths({ environment: { PM_DATA_DIR: rootDirectory } });
    const persistence = await openPersistence({ dataPaths: paths });
    persistence.close();

    for (const kind of ['pre-migration', 'pre-restore'] as const) {
      for (let index = 1; index <= 12; index += 1) {
        await writeAutomaticBackup(paths.backupsDirectory, automaticBackupFilename(kind, index));
      }
    }
    await writeFile(
      join(paths.backupsDirectory, 'ProjectManagerWorkspace-user.pmdbackup'),
      'manual'
    );
    await writeFile(join(paths.backupsDirectory, 'pre-migration-manual.sqlite'), 'must remain');

    const report = await pruneAutomaticBackups(paths);
    const entries = await readdir(paths.backupsDirectory);

    expect(report).toMatchObject({
      retained: { 'pre-migration': 10, 'pre-restore': 10 },
      failures: [],
      missingManifests: []
    });
    expect(report.deleted).toHaveLength(4);
    expect(
      entries.filter((name) => name.startsWith('pre-migration-') && name.endsWith('.sqlite'))
    ).toHaveLength(11);
    expect(
      entries.filter((name) => name.startsWith('pre-restore-') && name.endsWith('.sqlite'))
    ).toHaveLength(10);
    expect(entries).toContain('ProjectManagerWorkspace-user.pmdbackup');
    expect(entries).toContain('pre-migration-manual.sqlite');
    expect(entries).not.toContain(automaticBackupFilename('pre-migration', 1));
    expect(entries).not.toContain(automaticBackupFilename('pre-restore', 2));
    expect(entries).toContain(automaticBackupFilename('pre-migration', 12));
    expect(entries).toContain(`${automaticBackupFilename('pre-restore', 12)}.manifest.json`);
  });

  it('reports a missing manifest and a manifest deletion failure without touching unrelated files', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'project-manager-backup-retention-errors-'));
    temporaryRoots.push(rootDirectory);
    const paths = resolveDataPaths({ environment: { PM_DATA_DIR: rootDirectory } });
    const persistence = await openPersistence({ dataPaths: paths });
    persistence.close();

    const missingManifestBackup = automaticBackupFilename('pre-migration', 1);
    const manifestDirectoryBackup = automaticBackupFilename('pre-migration', 2);
    const retainedBackup = automaticBackupFilename('pre-migration', 3);
    await writeFile(join(paths.backupsDirectory, missingManifestBackup), 'old');
    await writeFile(join(paths.backupsDirectory, manifestDirectoryBackup), 'old');
    await mkdir(join(paths.backupsDirectory, `${manifestDirectoryBackup}.manifest.json`));
    await writeAutomaticBackup(paths.backupsDirectory, retainedBackup);
    await writeFile(join(paths.backupsDirectory, 'pre-restore-not-generated.sqlite'), 'unrelated');

    const report = await pruneAutomaticBackups(paths, 1);

    expect(report.retained['pre-migration']).toBe(1);
    expect(report.missingManifests).toEqual([`${missingManifestBackup}.manifest.json`]);
    expect(report.failures).toEqual([
      expect.objectContaining({
        filename: `${manifestDirectoryBackup}.manifest.json`,
        operation: 'manifest'
      })
    ]);
    await expect(
      readdir(join(paths.backupsDirectory, `${manifestDirectoryBackup}.manifest.json`))
    ).resolves.toEqual([]);
    expect(await readdir(paths.backupsDirectory)).toContain('pre-restore-not-generated.sqlite');
  });

  it('rejects invalid retention counts', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'project-manager-backup-retention-count-'));
    temporaryRoots.push(rootDirectory);
    const paths = resolveDataPaths({ environment: { PM_DATA_DIR: rootDirectory } });
    const persistence = await openPersistence({ dataPaths: paths });
    persistence.close();

    await expect(pruneAutomaticBackups(paths, -1)).rejects.toThrow(RangeError);
    await expect(pruneAutomaticBackups(paths, 1.5)).rejects.toThrow(RangeError);
  });
});

async function writeAutomaticBackup(directory: string, filename: string): Promise<void> {
  await writeFile(join(directory, filename), 'automatic backup');
  await writeFile(join(directory, `${filename}.manifest.json`), '{"kind":"test"}\n');
}

function automaticBackupFilename(kind: 'pre-migration' | 'pre-restore', index: number): string {
  const day = String(index).padStart(2, '0');
  const suffix = String(index).padStart(12, '0');
  return `${kind}-2026-08-${day}T00-00-00-000Z-00000000-0000-4000-8000-${suffix}.sqlite`;
}

async function readZipEntries(archive: Buffer): Promise<Record<string, Buffer>> {
  const zip = await yauzl.fromBufferPromise(archive, {
    autoClose: false,
    lazyEntries: true,
    validateEntrySizes: true,
    strictFileNames: true
  });
  const entries: Record<string, Buffer> = {};
  try {
    for await (const entry of zip.eachEntry()) {
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      entries[entry.fileName] = Buffer.concat(chunks);
    }
  } finally {
    zip.close();
  }
  return entries;
}
