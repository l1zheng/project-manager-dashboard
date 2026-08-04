import Fastify from 'fastify';
import { healthResponseSchema } from '@project-manager/domain';
import type { Persistence } from './persistence/database.js';
import type { MailDraftAdapter } from './outlook/adapter.js';
import { isWorkspaceRestorePending } from './persistence/restore.js';
import { registerWorkspaceRoutes } from './workspace/routes.js';

export interface BuildAppOptions {
  persistence?: Persistence;
  mailDraftAdapter?: MailDraftAdapter;
}

export function buildApp({ persistence, mailDraftAdapter }: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });

  if (persistence) {
    app.addHook('onClose', () => {
      persistence.close();
    });
    registerWorkspaceRoutes(app, persistence, { mailDraftAdapter });
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

  return app;
}
