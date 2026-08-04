import { buildApp } from './app.js';
import { openPersistence } from './persistence/database.js';
import { fileURLToPath } from 'node:url';
import { resolveServerConfig } from './server-config.js';

const { host, port } = resolveServerConfig();
const persistence = await openPersistence();
const webDistDirectory =
  process.env.PM_WEB_DIST_DIR?.trim() ?? fileURLToPath(new URL('../../web/dist/', import.meta.url));
const app = await buildApp({
  persistence,
  webDistDirectory,
  loopbackAddress: `${host}:${port}`,
  launchToken: process.env.PM_LAUNCH_TOKEN
});

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
