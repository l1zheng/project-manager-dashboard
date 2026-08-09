import {
  access,
  appendFile,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as yauzl from 'yauzl';
import { ZipFile as ZipWriter } from 'yazl';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspaceBackup } from './backups.js';
import { openPersistence, type Persistence } from './database.js';
import { resolveDataPaths } from './paths.js';
import {
  confirmWorkspaceRestore,
  inspectWorkspaceBackup,
  RestoreValidationError
} from './restore.js';
import * as schema from './schema.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe('workspace restore recovery', () => {
  it('inspects, confirms, and applies a complete workspace restore on next startup', async () => {
    const source = await createWorkspace('source', '来源工作区');
    const backup = await createWorkspaceBackup(
      source.persistence.sqlite,
      source.persistence.paths,
      {
        migrationState: source.persistence.migrationState,
        applicationVersion: '0.1.0-test',
        workspace: { id: source.workspaceId, name: '来源工作区' },
        now: new Date('2026-08-04T09:00:00.000Z')
      }
    );
    source.persistence.close();

    const target = await createWorkspace('target', '当前工作区');
    const inspection = await inspectWorkspaceBackup(
      backup.archive,
      target.persistence.paths,
      target.persistence.migrationsFolder,
      new Date('2026-08-04T09:05:00.000Z')
    );
    expect(inspection).toMatchObject({
      manifest: { workspace: { id: source.workspaceId, name: '来源工作区' } },
      migration: { appliedCount: 2, pendingCount: 0, totalCount: 2 }
    });

    const receipt = await confirmWorkspaceRestore(
      inspection.restoreId,
      target.persistence.sqlite,
      target.persistence.paths,
      target.persistence.migrationsFolder,
      new Date('2026-08-04T09:06:00.000Z')
    );
    expect(receipt).toMatchObject({ status: 'restart_required', restartRequired: true });
    await expect(access(receipt.preRestoreBackupPath)).resolves.toBeUndefined();
    target.persistence.close();

    const restored = await openPersistence({ dataPaths: target.paths });
    try {
      expect(restored.restoreResult).toMatchObject({
        status: 'restored',
        restoreId: inspection.restoreId
      });
      expect(workspaceNames(restored)).toEqual(['来源工作区']);
      await expect(access(target.paths.pendingRestorePath)).rejects.toMatchObject({
        code: 'ENOENT'
      });
      expect(await readdir(target.paths.restoreStagingDirectory)).toEqual([]);
    } finally {
      restored.close();
    }
  });

  it('restores the pre-restore snapshot when restored workspace startup fails', async () => {
    const source = await createWorkspace('rollback-source', '会失败的来源');
    const backup = await createWorkspaceBackup(
      source.persistence.sqlite,
      source.persistence.paths,
      {
        migrationState: source.persistence.migrationState,
        applicationVersion: '0.1.0-test',
        workspace: { id: source.workspaceId, name: '会失败的来源' }
      }
    );
    source.persistence.close();

    const target = await createWorkspace('rollback-target', '必须保留的当前工作区');
    const inspection = await inspectWorkspaceBackup(
      backup.archive,
      target.persistence.paths,
      target.persistence.migrationsFolder
    );
    await confirmWorkspaceRestore(
      inspection.restoreId,
      target.persistence.sqlite,
      target.persistence.paths,
      target.persistence.migrationsFolder
    );
    target.persistence.close();

    let migrationAttempts = 0;
    const recovered = await openPersistence({
      dataPaths: target.paths,
      runMigrations: (database, config) => {
        migrationAttempts += 1;
        if (migrationAttempts === 1) throw new Error('simulated restored-workspace failure');
        migrate(database, config);
      }
    });
    try {
      expect(migrationAttempts).toBe(2);
      expect(recovered.restoreResult).toMatchObject({
        status: 'rolled_back',
        restoreId: inspection.restoreId
      });
      expect(recovered.restoreResult?.message).toContain('simulated restored-workspace failure');
      expect(workspaceNames(recovered)).toEqual(['必须保留的当前工作区']);
      await expect(access(target.paths.pendingRestorePath)).rejects.toMatchObject({
        code: 'ENOENT'
      });
      const stageEntries = await readdir(
        join(target.paths.restoreStagingDirectory, inspection.restoreId)
      );
      expect(stageEntries).toContain('archive.pmdbackup');
      expect(stageEntries).toContain('restore-failed.json');
      expect(stageEntries.some((name) => name.startsWith('failed-workspace-'))).toBe(true);
    } finally {
      recovered.close();
    }
  });

  it('rejects a backup whose migration ledger diverges from the bundled migrations', async () => {
    const source = await createWorkspace('divergent', '分叉迁移工作区');
    source.persistence.sqlite.exec(
      "UPDATE __drizzle_migrations SET hash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'"
    );
    const backup = await createWorkspaceBackup(
      source.persistence.sqlite,
      source.persistence.paths,
      {
        migrationState: source.persistence.migrationState,
        applicationVersion: '0.1.0-test',
        workspace: { id: source.workspaceId, name: '分叉迁移工作区' }
      }
    );
    source.persistence.close();

    const target = await createWorkspace('divergent-target', '安全目标工作区');
    try {
      await expect(
        inspectWorkspaceBackup(
          backup.archive,
          target.persistence.paths,
          target.persistence.migrationsFolder
        )
      ).rejects.toMatchObject({
        code: 'migration_incompatible'
      } satisfies Partial<RestoreValidationError>);
      expect(workspaceNames(target.persistence)).toEqual(['安全目标工作区']);
      expect(await readdir(target.paths.restoreStagingDirectory)).toEqual([]);
    } finally {
      target.persistence.close();
    }
  });

  it('leaves the live workspace untouched when the rollback backup disappears before switching', async () => {
    const source = await createWorkspace('missing-rollback-source', '不会被安装的来源');
    const backup = await createWorkspaceBackup(
      source.persistence.sqlite,
      source.persistence.paths,
      {
        migrationState: source.persistence.migrationState,
        applicationVersion: '0.1.0-test',
        workspace: { id: source.workspaceId, name: '不会被安装的来源' }
      }
    );
    source.persistence.close();

    const target = await createWorkspace('missing-rollback-target', '仍然安全的当前工作区');
    const inspection = await inspectWorkspaceBackup(
      backup.archive,
      target.persistence.paths,
      target.persistence.migrationsFolder
    );
    const receipt = await confirmWorkspaceRestore(
      inspection.restoreId,
      target.persistence.sqlite,
      target.persistence.paths,
      target.persistence.migrationsFolder
    );
    await unlink(receipt.preRestoreBackupPath);
    target.persistence.close();

    const reopened = await openPersistence({ dataPaths: target.paths });
    try {
      expect(reopened.restoreResult).toMatchObject({ status: 'rolled_back' });
      expect(workspaceNames(reopened)).toEqual(['仍然安全的当前工作区']);
      await expect(access(target.paths.pendingRestorePath)).rejects.toMatchObject({
        code: 'ENOENT'
      });
    } finally {
      reopened.close();
    }
  });

  it('resumes an interrupted applying state and completes the restore', async () => {
    const source = await createWorkspace('interrupted-apply-source', '中断后继续的来源');
    const backup = await createWorkspaceBackup(
      source.persistence.sqlite,
      source.persistence.paths,
      {
        migrationState: source.persistence.migrationState,
        applicationVersion: '0.1.0-test',
        workspace: { id: source.workspaceId, name: '中断后继续的来源' }
      }
    );
    source.persistence.close();

    const target = await createWorkspace('interrupted-apply-target', '应用前的当前工作区');
    const inspection = await inspectWorkspaceBackup(
      backup.archive,
      target.persistence.paths,
      target.persistence.migrationsFolder
    );
    await confirmWorkspaceRestore(
      inspection.restoreId,
      target.persistence.sqlite,
      target.persistence.paths,
      target.persistence.migrationsFolder
    );
    target.persistence.close();
    await rewritePendingState(target.paths.pendingRestorePath, 'applying');

    const resumed = await openPersistence({ dataPaths: target.paths });
    try {
      expect(resumed.restoreResult).toMatchObject({
        status: 'restored',
        restoreId: inspection.restoreId
      });
      expect(workspaceNames(resumed)).toEqual(['中断后继续的来源']);
    } finally {
      resumed.close();
    }
  });

  it('finishes an interrupted rollback state without installing the candidate', async () => {
    const source = await createWorkspace('interrupted-rollback-source', '不应安装的来源');
    const backup = await createWorkspaceBackup(
      source.persistence.sqlite,
      source.persistence.paths,
      {
        migrationState: source.persistence.migrationState,
        applicationVersion: '0.1.0-test',
        workspace: { id: source.workspaceId, name: '不应安装的来源' }
      }
    );
    source.persistence.close();

    const target = await createWorkspace('interrupted-rollback-target', '回滚后保留的工作区');
    const inspection = await inspectWorkspaceBackup(
      backup.archive,
      target.persistence.paths,
      target.persistence.migrationsFolder
    );
    await confirmWorkspaceRestore(
      inspection.restoreId,
      target.persistence.sqlite,
      target.persistence.paths,
      target.persistence.migrationsFolder
    );
    target.persistence.close();
    await rewritePendingState(target.paths.pendingRestorePath, 'rolling_back');

    const resumed = await openPersistence({ dataPaths: target.paths });
    try {
      expect(resumed.restoreResult).toMatchObject({
        status: 'rolled_back',
        restoreId: inspection.restoreId
      });
      expect(workspaceNames(resumed)).toEqual(['回滚后保留的工作区']);
      await expect(access(target.paths.pendingRestorePath)).rejects.toMatchObject({
        code: 'ENOENT'
      });
    } finally {
      resumed.close();
    }
  });

  it('revalidates the staged candidate immediately before confirmation', async () => {
    const source = await createWorkspace('changed-stage-source', '暂存来源');
    const backup = await createWorkspaceBackup(
      source.persistence.sqlite,
      source.persistence.paths,
      {
        migrationState: source.persistence.migrationState,
        applicationVersion: '0.1.0-test',
        workspace: { id: source.workspaceId, name: '暂存来源' }
      }
    );
    source.persistence.close();

    const target = await createWorkspace('changed-stage-target', '不被覆盖的当前工作区');
    const inspection = await inspectWorkspaceBackup(
      backup.archive,
      target.persistence.paths,
      target.persistence.migrationsFolder
    );
    const stageDirectory = join(target.paths.restoreStagingDirectory, inspection.restoreId);
    await appendFile(join(stageDirectory, 'candidate.sqlite'), Buffer.from([0]));

    try {
      await expect(
        confirmWorkspaceRestore(
          inspection.restoreId,
          target.persistence.sqlite,
          target.persistence.paths,
          target.persistence.migrationsFolder
        )
      ).rejects.toMatchObject({ code: 'staged_candidate_changed' });
      expect(workspaceNames(target.persistence)).toEqual(['不被覆盖的当前工作区']);
      await expect(access(target.paths.pendingRestorePath)).rejects.toMatchObject({
        code: 'ENOENT'
      });
    } finally {
      target.persistence.close();
    }
  });

  it('rejects extra entries, duplicate entries, and checksum tampering without touching live data', async () => {
    const source = await createWorkspace('hostile-source', '合法来源工作区');
    const backup = await createWorkspaceBackup(
      source.persistence.sqlite,
      source.persistence.paths,
      {
        migrationState: source.persistence.migrationState,
        applicationVersion: '0.1.0-test',
        workspace: { id: source.workspaceId, name: '合法来源工作区' }
      }
    );
    source.persistence.close();
    const entries = await readZipEntries(backup.archive);
    const target = await createWorkspace('hostile-target', '不能被改动的目标');

    try {
      const extraEntryArchive = await createZip([
        ['manifest.json', entries['manifest.json']!],
        ['workspace.sqlite', entries['workspace.sqlite']!],
        ['unexpected.txt', Buffer.from('not allowed')]
      ]);
      await expect(
        inspectWorkspaceBackup(
          extraEntryArchive,
          target.persistence.paths,
          target.persistence.migrationsFolder
        )
      ).rejects.toMatchObject({ code: 'unexpected_archive_entry' });

      const duplicateEntryArchive = await createZip([
        ['manifest.json', entries['manifest.json']!],
        ['manifest.json', entries['manifest.json']!],
        ['workspace.sqlite', entries['workspace.sqlite']!]
      ]);
      await expect(
        inspectWorkspaceBackup(
          duplicateEntryArchive,
          target.persistence.paths,
          target.persistence.migrationsFolder
        )
      ).rejects.toMatchObject({ code: 'duplicate_archive_entry' });

      const tamperedManifest = JSON.parse(entries['manifest.json']!.toString('utf8')) as {
        database: { sha256: string };
      };
      tamperedManifest.database.sha256 = '0'.repeat(64);
      const checksumArchive = await createZip([
        ['manifest.json', Buffer.from(`${JSON.stringify(tamperedManifest)}\n`)],
        ['workspace.sqlite', entries['workspace.sqlite']!]
      ]);
      await expect(
        inspectWorkspaceBackup(
          checksumArchive,
          target.persistence.paths,
          target.persistence.migrationsFolder
        )
      ).rejects.toMatchObject({ code: 'checksum_mismatch' });

      expect(workspaceNames(target.persistence)).toEqual(['不能被改动的目标']);
      expect(await readdir(target.paths.restoreStagingDirectory)).toEqual([]);
    } finally {
      target.persistence.close();
    }
  });
});

async function createWorkspace(suffix: string, name: string) {
  const rootDirectory = await mkdtemp(join(tmpdir(), `project-manager-restore-${suffix}-`));
  temporaryRoots.push(rootDirectory);
  const paths = resolveDataPaths({ environment: { PM_DATA_DIR: rootDirectory } });
  const persistence = await openPersistence({ dataPaths: paths });
  const workspaceId = `workspace-${suffix}`;
  const now = new Date('2026-08-04T08:00:00.000Z');
  persistence.db
    .insert(schema.workspaces)
    .values({ id: workspaceId, name, createdAt: now, updatedAt: now })
    .run();
  return { paths, persistence, workspaceId };
}

function workspaceNames(persistence: Persistence): string[] {
  return persistence.db
    .select({ name: schema.workspaces.name })
    .from(schema.workspaces)
    .all()
    .map((workspace) => workspace.name);
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

async function createZip(entries: Array<[string, Buffer]>): Promise<Buffer> {
  const zip = new ZipWriter();
  for (const [name, content] of entries) zip.addBuffer(content, name);
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function rewritePendingState(
  pendingRestorePath: string,
  state: 'applying' | 'rolling_back'
): Promise<void> {
  const marker = JSON.parse(await readFile(pendingRestorePath, 'utf8')) as Record<string, unknown>;
  await writeFile(pendingRestorePath, `${JSON.stringify({ ...marker, state }, null, 2)}\n`, 'utf8');
}
