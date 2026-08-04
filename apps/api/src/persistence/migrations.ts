import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { readMigrationFiles } from 'drizzle-orm/migrator';

const migrationsTableName = '__drizzle_migrations';

export interface MigrationState {
  appliedCount: number;
  pendingCount: number;
  totalCount: number;
}

export function inspectMigrationState(
  sqlite: Database.Database,
  migrationsFolder: string
): MigrationState {
  const journalPath = join(migrationsFolder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries?: unknown[] };
  const totalCount = journal.entries?.length;

  if (typeof totalCount !== 'number') {
    throw new Error(`Invalid Drizzle migration journal: ${journalPath}`);
  }

  const hasMigrationLedger = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(migrationsTableName);
  const appliedCount = hasMigrationLedger
    ? Number(
        (
          sqlite.prepare(`SELECT count(*) AS count FROM ${migrationsTableName}`).get() as {
            count: number;
          }
        ).count
      )
    : 0;

  if (appliedCount > totalCount) {
    throw new Error(
      `Database has ${appliedCount} applied migrations, but this build contains only ${totalCount}. Downgrades are not supported.`
    );
  }

  return {
    appliedCount,
    pendingCount: totalCount - appliedCount,
    totalCount
  };
}

export function assertMigrationHistoryCompatible(
  sqlite: Database.Database,
  migrationsFolder: string
): MigrationState {
  const bundled = readMigrationFiles({ migrationsFolder });
  const hasMigrationLedger = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(migrationsTableName);
  const applied = hasMigrationLedger
    ? (sqlite
        .prepare(
          `SELECT hash, created_at AS createdAt FROM ${migrationsTableName} ORDER BY created_at ASC, id ASC`
        )
        .all() as Array<{ hash: string; createdAt: number }>)
    : [];

  if (applied.length > bundled.length) {
    throw new Error(
      `Backup has ${applied.length} applied migrations, but this build contains only ${bundled.length}.`
    );
  }

  for (const [index, migration] of applied.entries()) {
    const expected = bundled[index];
    if (
      !expected ||
      migration.hash !== expected.hash ||
      Number(migration.createdAt) !== expected.folderMillis
    ) {
      throw new Error(`Backup migration history diverges at migration ${index + 1}.`);
    }
  }

  return {
    appliedCount: applied.length,
    pendingCount: bundled.length - applied.length,
    totalCount: bundled.length
  };
}

export function hasWorkspaceSchema(sqlite: Database.Database): boolean {
  return Boolean(
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'").get()
  );
}

export function assertDatabaseHealthy(sqlite: Database.Database): void {
  const quickCheck = sqlite.pragma('quick_check', { simple: true });

  if (quickCheck !== 'ok') {
    throw new Error(`SQLite integrity check failed: ${String(quickCheck)}`);
  }
}

export function assertForeignKeysHealthy(sqlite: Database.Database): void {
  const violations = sqlite.pragma('foreign_key_check') as unknown[];

  if (violations.length > 0) {
    throw new Error(`SQLite foreign-key check found ${violations.length} violation(s).`);
  }
}

export function configureSqlite(sqlite: Database.Database): void {
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = FULL');
}

export function resolveMigrationsFolder(): string {
  return fileURLToPath(new URL('../../drizzle/', import.meta.url));
}

export function migrationFolderExists(migrationsFolder: string): boolean {
  return existsSync(join(migrationsFolder, 'meta', '_journal.json'));
}
