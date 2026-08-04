import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

const launchTokenPattern = /^[0-9a-f]{64}$/i;

export function registerRuntimeControl(
  app: FastifyInstance,
  options: { launchToken?: string; shutdown?: () => void | Promise<void> }
): void {
  const launchToken = options.launchToken?.trim();
  if (!launchTokenPattern.test(launchToken ?? '')) return;

  app.post('/api/runtime/shutdown', async (request, reply) => {
    const suppliedToken = request.headers['x-project-manager-launch-token'];
    if (typeof suppliedToken !== 'string' || !tokensMatch(launchToken!, suppliedToken)) {
      return reply.code(403).send({
        error: 'runtime_control_forbidden',
        message: '本地应用控制凭据无效。'
      });
    }

    reply.send({ status: 'stopping' });
    setImmediate(() => {
      const shutdown = options.shutdown ? options.shutdown() : app.close();
      void Promise.resolve(shutdown).catch((error: unknown) => {
        app.log.error(error, 'Failed to close the local application cleanly.');
      });
    });
  });
}

function tokensMatch(expected: string, supplied: string): boolean {
  if (!launchTokenPattern.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}
