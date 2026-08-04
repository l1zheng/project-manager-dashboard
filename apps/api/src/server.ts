import { buildApp } from './app.js';
import { openPersistence } from './persistence/database.js';
import { fileURLToPath } from 'node:url';

const host = process.env.PM_HOST ?? '127.0.0.1';
const port = Number(process.env.PM_API_PORT ?? 4300);
const persistence = await openPersistence();
const webDistDirectory =
  process.env.PM_WEB_DIST_DIR?.trim() ?? fileURLToPath(new URL('../../web/dist/', import.meta.url));
const app = await buildApp({ persistence, webDistDirectory, loopbackAddress: `${host}:${port}` });

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
