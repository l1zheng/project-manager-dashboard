import { statfs } from 'node:fs/promises';
import { createDefaultMailDraftAdapter, type MailDraftAdapter } from './outlook/adapter.js';
import { findLatestVerifiedAutomaticBackup } from './persistence/backups.js';
import { assertDatabaseHealthy, assertForeignKeysHealthy } from './persistence/migrations.js';
import type { Persistence } from './persistence/database.js';

export interface RuntimeDiagnostics {
  application: {
    version: string;
    nodeVersion: string;
    platform: NodeJS.Platform;
    architecture: string;
    loopbackAddress: string;
  };
  storage: {
    dataDirectory: string;
    database: { healthy: boolean };
    migration: Persistence['migrationState'];
    latestAutomaticBackup?: { kind: string; createdAt: string; bytes: number };
    availableBytes?: number;
    firstRun: boolean;
  };
  outlook: Awaited<ReturnType<MailDraftAdapter['probe']>>;
}

export async function collectRuntimeDiagnostics(
  persistence: Persistence,
  options: { mailDraftAdapter?: MailDraftAdapter; loopbackAddress?: string } = {}
): Promise<RuntimeDiagnostics> {
  let healthy = true;
  try {
    assertDatabaseHealthy(persistence.sqlite);
    assertForeignKeysHealthy(persistence.sqlite);
  } catch {
    healthy = false;
  }

  const [backup, filesystem, outlook, workspace] = await Promise.all([
    findLatestVerifiedAutomaticBackup(persistence.paths),
    statfs(persistence.paths.rootDirectory).catch(() => undefined),
    (options.mailDraftAdapter ?? createDefaultMailDraftAdapter()).probe(),
    Promise.resolve(
      persistence.sqlite.prepare('SELECT COUNT(*) AS count FROM workspaces').get() as {
        count: number;
      }
    )
  ]);

  return {
    application: {
      version: process.env.PM_APP_VERSION?.trim() || '0.1.0',
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      loopbackAddress: options.loopbackAddress ?? '127.0.0.1'
    },
    storage: {
      dataDirectory: persistence.paths.rootDirectory,
      database: { healthy },
      migration: persistence.migrationState,
      latestAutomaticBackup: backup
        ? { kind: backup.kind, createdAt: backup.createdAt, bytes: backup.bytes }
        : undefined,
      availableBytes: filesystem ? Number(filesystem.bavail) * Number(filesystem.bsize) : undefined,
      firstRun: workspace.count === 0
    },
    outlook
  };
}
