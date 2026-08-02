import Fastify from 'fastify';
import { healthResponseSchema } from '@project-manager/domain';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.get('/api/health', async () => {
    return healthResponseSchema.parse({
      status: 'ok',
      service: 'project-manager-api',
      timestamp: new Date().toISOString()
    });
  });

  return app;
}
