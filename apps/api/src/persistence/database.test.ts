import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openPersistence, PersistenceStartupError } from './database.js';
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

    expect(persistence.migrationState).toEqual({ appliedCount: 1, pendingCount: 0, totalCount: 1 });
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
    expect(reopened.migrationState).toEqual({ appliedCount: 1, pendingCount: 0, totalCount: 1 });
    expect(reopened.backup).toBeUndefined();
    expect(
      reopened.sqlite
        .prepare("SELECT values_json AS value FROM records WHERE id = 'record-1'")
        .get()
    ).toEqual({ value: '{"field-name":"支持单点登录"}' });
    reopened.close();
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
