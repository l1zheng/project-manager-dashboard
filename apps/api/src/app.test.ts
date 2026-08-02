import { afterAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from './app.js';
import { openPersistence } from './persistence/database.js';
import { resolveDataPaths } from './persistence/paths.js';

const app = buildApp();

afterAll(async () => {
  await app.close();
});

describe('health endpoint', () => {
  it('returns the local API status', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      service: 'project-manager-api'
    });
  });

  it('reports the initialized local SQLite migration state', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'project-manager-health-'));
    const persistence = await openPersistence({
      dataPaths: resolveDataPaths({ environment: { PM_DATA_DIR: rootDirectory } })
    });
    const storageApp = buildApp({ persistence });

    try {
      const response = await storageApp.inject({ method: 'GET', url: '/api/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        storage: {
          engine: 'sqlite',
          migration: { appliedCount: 1, pendingCount: 0, totalCount: 1 }
        }
      });
    } finally {
      await storageApp.close();
      await rm(rootDirectory, { recursive: true, force: true });
    }
  });
});
