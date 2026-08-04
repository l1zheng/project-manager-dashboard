import Fastify from 'fastify';
import { healthResponseSchema } from '@project-manager/domain';
import { collectRuntimeDiagnostics } from './diagnostics.js';
import type { Persistence } from './persistence/database.js';
import { createDefaultMailDraftAdapter, type MailDraftAdapter } from './outlook/adapter.js';
import { isWorkspaceRestorePending } from './persistence/restore.js';
import { registerWebAssets } from './web-assets.js';
import { registerWorkspaceRoutes } from './workspace/routes.js';

export interface BuildAppOptions {
  persistence?: Persistence;
  mailDraftAdapter?: MailDraftAdapter;
  webDistDirectory?: string;
  loopbackAddress?: string;
}

export async function buildApp({
  persistence,
  mailDraftAdapter,
  webDistDirectory,
  loopbackAddress
}: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });
  const adapter = mailDraftAdapter ?? createDefaultMailDraftAdapter();

  if (persistence) {
    app.addHook('onClose', () => {
      persistence.close();
    });
    registerWorkspaceRoutes(app, persistence, { mailDraftAdapter: adapter });
  }

  app.get('/api/health', async () => {
    const restorePending = persistence
      ? await isWorkspaceRestorePending(persistence.paths)
      : undefined;
    return healthResponseSchema.parse({
      status: 'ok',
      service: 'project-manager-api',
      timestamp: new Date().toISOString(),
      storage: persistence
        ? {
            engine: 'sqlite',
            migration: persistence.migrationState,
            restorePending,
            restore: persistence.restoreResult
              ? {
                  status: persistence.restoreResult.status,
                  restoreId: persistence.restoreResult.restoreId,
                  message: persistence.restoreResult.message
                }
              : undefined
          }
        : undefined
    });
  });

  if (persistence) {
    app.get('/api/diagnostics', async () =>
      collectRuntimeDiagnostics(persistence, { mailDraftAdapter: adapter, loopbackAddress })
    );
  }

  if (webDistDirectory) await registerWebAssets(app, webDistDirectory);

  return app;
}
