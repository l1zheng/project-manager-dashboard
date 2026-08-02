import { buildApp } from './app.js';
import { openPersistence } from './persistence/database.js';

const host = process.env.PM_HOST ?? '127.0.0.1';
const port = Number(process.env.PM_API_PORT ?? 4300);
const persistence = await openPersistence();
const app = buildApp({ persistence });

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
