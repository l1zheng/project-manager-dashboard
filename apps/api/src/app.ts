import Fastify from 'fastify';
import { healthResponseSchema } from '@project-manager/domain';
import type { Persistence } from './persistence/database.js';
import { registerWorkspaceRoutes } from './workspace/routes.js';

export interface BuildAppOptions {
  persistence?: Persistence;
}

export function buildApp({ persistence }: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });

  if (persistence) {
    app.addHook('onClose', () => {
      persistence.close();
    });
    registerWorkspaceRoutes(app, persistence);
  }

  app.get('/api/health', async () => {
    return healthResponseSchema.parse({
      status: 'ok',
      service: 'project-manager-api',
      timestamp: new Date().toISOString(),
      storage: persistence
        ? {
            engine: 'sqlite',
            migration: persistence.migrationState
          }
        : undefined
    });
  });

  return app;
}
