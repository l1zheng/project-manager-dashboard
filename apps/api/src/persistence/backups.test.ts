import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import * as yauzl from 'yauzl';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspaceBackup } from './backups.js';
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
});

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
