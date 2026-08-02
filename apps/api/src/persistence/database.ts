import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { MigrationConfig } from 'drizzle-orm/migrator';
import { createVerifiedBackup, pruneAutomaticBackups, type VerifiedBackup } from './backups.js';
import {
  assertDatabaseHealthy,
  assertForeignKeysHealthy,
  configureSqlite,
  hasWorkspaceSchema,
  inspectMigrationState,
  migrationFolderExists,
  resolveMigrationsFolder,
  type MigrationState
} from './migrations.js';
import { ensureDataDirectories, resolveDataPaths, type DataPaths } from './paths.js';
import * as schema from './schema.js';

const sqliteBusyTimeoutMilliseconds = 5_000;

export interface Persistence {
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
  paths: DataPaths;
  migrationState: MigrationState;
  backup: VerifiedBackup | undefined;
  close(): void;
}

export interface OpenPersistenceOptions {
  dataPaths?: DataPaths;
  migrationsFolder?: string;
  runMigrations?: (database: BetterSQLite3Database<typeof schema>, config: MigrationConfig) => void;
}

export class PersistenceStartupError extends Error {
  readonly backupPath: string | undefined;

  constructor(message: string, backupPath: string | undefined, cause: unknown) {
    super(message);
    this.name = 'PersistenceStartupError';
    this.backupPath = backupPath;
    this.cause = cause;
  }
}

export async function openPersistence(options: OpenPersistenceOptions = {}): Promise<Persistence> {
  const paths = options.dataPaths ?? resolveDataPaths();
  const migrationsFolder = options.migrationsFolder ?? resolveMigrationsFolder();
  const runMigrations = options.runMigrations ?? migrate;

  if (!migrationFolderExists(migrationsFolder)) {
    throw new Error(`Migration bundle is missing: ${migrationsFolder}`);
  }

  await ensureDataDirectories(paths);
  const existingDatabase = existsSync(paths.databasePath);
  const sqlite = new Database(paths.databasePath, { timeout: sqliteBusyTimeoutMilliseconds });
  let backup: VerifiedBackup | undefined;

  try {
    configureSqlite(sqlite);
    assertDatabaseHealthy(sqlite);

    const migrationStateBefore = inspectMigrationState(sqlite, migrationsFolder);
    if (existingDatabase && migrationStateBefore.pendingCount > 0 && hasWorkspaceSchema(sqlite)) {
      backup = await createVerifiedBackup(sqlite, paths);
    }

    const db = drizzle(sqlite, { schema });
    runMigrations(db, { migrationsFolder });
    assertForeignKeysHealthy(sqlite);
    const migrationState = inspectMigrationState(sqlite, migrationsFolder);

    if (backup) {
      await pruneAutomaticBackups(paths);
    }

    return {
      sqlite,
      db,
      paths,
      migrationState,
      backup,
      close: () => sqlite.close()
    };
  } catch (error) {
    sqlite.close();
    throw new PersistenceStartupError(
      'The local workspace could not be initialized safely.',
      backup?.databasePath,
      error
    );
  }
}
