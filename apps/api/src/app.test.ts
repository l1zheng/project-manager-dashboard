import { afterAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from './app.js';
import { openPersistence } from './persistence/database.js';
import { resolveDataPaths } from './persistence/paths.js';

const app = await buildApp();

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
    const storageApp = await buildApp({ persistence });

    try {
      const response = await storageApp.inject({ method: 'GET', url: '/api/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        storage: {
          engine: 'sqlite',
          migration: { appliedCount: 2, pendingCount: 0, totalCount: 2 }
        }
      });
    } finally {
      await storageApp.close();
      await rm(rootDirectory, { recursive: true, force: true });
    }
  });

  it('reports local runtime diagnostics without workspace contents', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'project-manager-diagnostics-'));
    const persistence = await openPersistence({
      dataPaths: resolveDataPaths({ environment: { PM_DATA_DIR: rootDirectory } })
    });
    const storageApp = await buildApp({
      persistence,
      loopbackAddress: '127.0.0.1:4300'
    });

    try {
      const response = await storageApp.inject({ method: 'GET', url: '/api/diagnostics' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        application: { loopbackAddress: '127.0.0.1:4300' },
        storage: {
          dataDirectory: rootDirectory,
          database: { healthy: true },
          firstRun: true,
          migration: { pendingCount: 0 }
        }
      });
      expect(response.body).not.toContain('records');
    } finally {
      await storageApp.close();
      await rm(rootDirectory, { recursive: true, force: true });
    }
  });

  it('serves a production web build while keeping API misses as API 404 responses', async () => {
    const webDirectory = await mkdtemp(join(tmpdir(), 'project-manager-web-build-'));
    await mkdir(join(webDirectory, 'assets'));
    await writeFile(webDirectory + '/index.html', '<!doctype html><title>项目管理工作台</title>');
    await writeFile(join(webDirectory, 'assets', 'app.js'), 'window.appReady = true;');
    const webApp = await buildApp({ webDistDirectory: webDirectory });

    try {
      const index = await webApp.inject({ method: 'GET', url: '/' });
      const asset = await webApp.inject({ method: 'GET', url: '/assets/app.js' });
      const clientRoute = await webApp.inject({ method: 'GET', url: '/dashboard/today' });
      const missingAsset = await webApp.inject({ method: 'GET', url: '/assets/missing.js' });
      const apiMiss = await webApp.inject({ method: 'GET', url: '/api/does-not-exist' });
      const apiRoot = await webApp.inject({ method: 'GET', url: '/api' });

      expect(index.statusCode).toBe(200);
      expect(index.headers['cache-control']).toBe('no-cache');
      expect(index.body).toContain('项目管理工作台');
      expect(asset.statusCode).toBe(200);
      expect(asset.headers['cache-control']).toContain('immutable');
      expect(asset.headers['content-type']).toContain('text/javascript');
      expect(clientRoute.statusCode).toBe(200);
      expect(clientRoute.body).toContain('项目管理工作台');
      expect(missingAsset.statusCode).toBe(404);
      expect(apiMiss.statusCode).toBe(404);
      expect(apiRoot.statusCode).toBe(404);
    } finally {
      await webApp.close();
      await rm(webDirectory, { recursive: true, force: true });
    }
  });

  it('allows only the authenticated local launcher to request a graceful stop', async () => {
    const launchToken = 'a'.repeat(64);
    let shutdownCalls = 0;
    const runtimeApp = await buildApp({
      launchToken,
      shutdown: () => {
        shutdownCalls += 1;
      }
    });

    try {
      const denied = await runtimeApp.inject({ method: 'POST', url: '/api/runtime/shutdown' });
      const accepted = await runtimeApp.inject({
        method: 'POST',
        url: '/api/runtime/shutdown',
        headers: { 'x-project-manager-launch-token': launchToken }
      });
      await new Promise((resolve) => setImmediate(resolve));

      expect(denied.statusCode).toBe(403);
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json()).toEqual({ status: 'stopping' });
      expect(shutdownCalls).toBe(1);
    } finally {
      await runtimeApp.close();
    }
  });
});
