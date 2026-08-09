import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openPersistence, PersistenceStartupError } from './database.js';
import { resolveMigrationsFolder } from './migrations.js';
import { resolveDataPaths } from './paths.js';
import * as schema from './schema.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe('SQLite persistence foundation', () => {
  it('initializes the full schema, preserves Chinese data, and reopens idempotently', async () => {
    const paths = await createTestPaths();
    const persistence = await openPersistence({ dataPaths: paths });
    const createdAt = new Date('2026-08-03T12:00:00.000Z');

    expect(persistence.migrationState).toEqual({ appliedCount: 2, pendingCount: 0, totalCount: 2 });
    expect(persistence.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(persistence.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');

    persistence.db
      .insert(schema.workspaces)
      .values({
        id: 'workspace-1',
        name: '项目周报',
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
    persistence.db
      .insert(schema.fields)
      .values({
        id: 'field-name',
        databaseId: 'database-1',
        name: '需求名称',
        type: 'short_text',
        sortOrder: 1000,
        createdAt,
        updatedAt: createdAt
      })
      .run();
    persistence.db
      .insert(schema.records)
      .values({
        id: 'record-1',
        databaseId: 'database-1',
        sequenceNumber: 1,
        sortOrder: 1000,
        valuesJson: JSON.stringify({ 'field-name': '支持单点登录' }),
        createdAt,
        updatedAt: createdAt
      })
      .run();
    persistence.db
      .insert(schema.views)
      .values({
        id: 'view-1',
        databaseId: 'database-1',
        name: '本周需求',
        sortOrder: 1000,
        configJson: JSON.stringify({ version: 1, visibleFieldIds: ['field-name'] }),
        createdAt,
        updatedAt: createdAt
      })
      .run();
    persistence.db
      .insert(schema.dashboards)
      .values({
        id: 'dashboard-1',
        workspaceId: 'workspace-1',
        name: '项目管理看板',
        sortOrder: 1000,
        createdAt,
        updatedAt: createdAt
      })
      .run();
    persistence.db
      .insert(schema.dashboardBlocks)
      .values({
        id: 'block-1',
        dashboardId: 'dashboard-1',
        viewId: 'view-1',
        configJson: JSON.stringify({
          version: 1,
          titleOverride: null,
          description: null
        }),
        sortOrder: 1000,
        createdAt,
        updatedAt: createdAt
      })
      .run();

    expect(() =>
      persistence.sqlite
        .prepare(
          "INSERT INTO fields (id, database_id, name, type, created_at, updated_at) VALUES ('orphan-field', 'missing', '无效', 'short_text', 0, 0)"
        )
        .run()
    ).toThrow();
    persistence.close();

    const reopened = await openPersistence({ dataPaths: paths });
    expect(reopened.migrationState).toEqual({ appliedCount: 2, pendingCount: 0, totalCount: 2 });
    expect(reopened.backup).toBeUndefined();
    expect(
      reopened.sqlite
        .prepare("SELECT values_json AS value FROM records WHERE id = 'record-1'")
        .get()
    ).toEqual({ value: '{"field-name":"支持单点登录"}' });
    reopened.close();
  });

  it('upgrades legacy table blocks without changing IDs, order, references, or flags', async () => {
    const paths = await createTestPaths();
    const legacyMigrationsFolder = join(paths.rootDirectory, 'legacy-migrations');
    await mkdir(join(legacyMigrationsFolder, 'meta'), { recursive: true });
    const bundledMigrationsFolder = resolveMigrationsFolder();
    await writeFile(
      join(legacyMigrationsFolder, '0000_polite_adam_warlock.sql'),
      await readFile(join(bundledMigrationsFolder, '0000_polite_adam_warlock.sql'))
    );
    const journal = JSON.parse(
      await readFile(join(bundledMigrationsFolder, 'meta', '_journal.json'), 'utf8')
    ) as { entries: unknown[] };
    await writeFile(
      join(legacyMigrationsFolder, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) })
    );

    const legacy = await openPersistence({
      dataPaths: paths,
      migrationsFolder: legacyMigrationsFolder
    });
    legacy.sqlite.exec(`
      INSERT INTO workspaces (id, name, created_at, updated_at)
      VALUES ('workspace-v1', '旧工作区', 100, 100);
      INSERT INTO databases (id, workspace_id, name, sort_order, created_at, updated_at)
      VALUES ('database-v1', 'workspace-v1', '需求跟踪', 1000, 100, 100);
      INSERT INTO views (id, database_id, name, config_json, sort_order, created_at, updated_at)
      VALUES ('view-v1', 'database-v1', '表格', '{"version":1,"visibleFieldIds":[]}', 1000, 100, 100);
      INSERT INTO dashboards (id, workspace_id, name, sort_order, created_at, updated_at)
      VALUES ('dashboard-v1', 'workspace-v1', '项目工作台', 1000, 100, 100);
      INSERT INTO dashboard_blocks
        (id, dashboard_id, view_id, title_override, description, sort_order, is_collapsed, include_in_export, created_at, updated_at)
      VALUES
        ('block-v1', 'dashboard-v1', 'view-v1', '重点需求', '仅限本周', 4321, 1, 0, 100, 200);
    `);
    legacy.close();

    const upgraded = await openPersistence({ dataPaths: paths });
    try {
      expect(upgraded.backup).toBeDefined();
      expect(upgraded.migrationState).toEqual({ appliedCount: 2, pendingCount: 0, totalCount: 2 });
      const block = upgraded.sqlite
        .prepare(
          `SELECT id, dashboard_id AS dashboardId, kind, view_id AS viewId,
                  media_asset_id AS mediaAssetId, config_version AS configVersion,
                  config_json AS configJson, sort_order AS sortOrder,
                  is_collapsed AS isCollapsed, include_in_export AS includeInExport,
                  created_at AS createdAt, updated_at AS updatedAt
             FROM dashboard_blocks WHERE id = 'block-v1'`
        )
        .get() as Record<string, unknown>;
      expect(block).toMatchObject({
        id: 'block-v1',
        dashboardId: 'dashboard-v1',
        kind: 'table_view',
        viewId: 'view-v1',
        mediaAssetId: null,
        configVersion: 1,
        sortOrder: 4321,
        isCollapsed: 1,
        includeInExport: 0,
        createdAt: 100,
        updatedAt: 200
      });
      expect(JSON.parse(String(block.configJson))).toEqual({
        version: 1,
        titleOverride: '重点需求',
        description: '仅限本周'
      });
      expect(
        upgraded.sqlite
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'media_assets'")
          .get()
      ).toEqual({ name: 'media_assets' });
      expect(upgraded.sqlite.pragma('foreign_key_check')).toEqual([]);
    } finally {
      upgraded.close();
    }
  });

  it('takes a verified backup before a pending migration can fail', async () => {
    const paths = await createTestPaths();
    const initial = await openPersistence({ dataPaths: paths });
    initial.db
      .insert(schema.workspaces)
      .values({
        id: 'workspace-1',
        name: '可恢复工作区',
        createdAt: new Date('2026-08-03T12:00:00.000Z'),
        updatedAt: new Date('2026-08-03T12:00:00.000Z')
      })
      .run();
    initial.sqlite.exec('DELETE FROM __drizzle_migrations');
    initial.close();

    let startupError: unknown;
    try {
      await openPersistence({
        dataPaths: paths,
        runMigrations: () => {
          throw new Error('simulated migration failure');
        }
      });
    } catch (error) {
      startupError = error;
    }

    expect(startupError).toBeInstanceOf(PersistenceStartupError);
    const backupPath = (startupError as PersistenceStartupError).backupPath;
    expect(backupPath).toBeDefined();

    const backup = new Database(backupPath!, { readonly: true });
    try {
      expect(backup.pragma('quick_check', { simple: true })).toBe('ok');
      expect(backup.prepare('SELECT name FROM workspaces WHERE id = ?').get('workspace-1')).toEqual(
        {
          name: '可恢复工作区'
        }
      );
    } finally {
      backup.close();
    }
  });
});

async function createTestPaths() {
  const rootDirectory = await mkdtemp(join(tmpdir(), 'project-manager-persistence-'));
  temporaryRoots.push(rootDirectory);
  return resolveDataPaths({ environment: { PM_DATA_DIR: rootDirectory } });
}
