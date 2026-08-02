import { buildApp } from './app.js';

const app = buildApp();
const host = process.env.PM_HOST ?? '127.0.0.1';
const port = Number(process.env.PM_API_PORT ?? 4300);

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
