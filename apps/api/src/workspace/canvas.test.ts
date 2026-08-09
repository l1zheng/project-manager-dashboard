import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openPersistence } from '../persistence/database.js';
import { resolveDataPaths } from '../persistence/paths.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe('workspace canvas API', () => {
  it('assembles every database on one idempotent primary dashboard', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'project-manager-canvas-'));
    temporaryRoots.push(rootDirectory);
    const persistence = await openPersistence({
      dataPaths: resolveDataPaths({ environment: { PM_DATA_DIR: rootDirectory } })
    });
    const app = await buildApp({ persistence });

    try {
      const requirements = (
        await app.inject({
          method: 'POST',
          url: '/api/databases',
          payload: { name: '需求跟踪' }
        })
      ).json() as { id: string };
      const risks = (
        await app.inject({
          method: 'POST',
          url: '/api/databases',
          payload: { name: '关键风险' }
        })
      ).json() as { id: string };

      await app.inject({
        method: 'POST',
        url: `/api/databases/${requirements.id}/fields`,
        payload: { name: '需求名称', type: 'short_text' }
      });
      await app.inject({
        method: 'POST',
        url: `/api/databases/${risks.id}/fields`,
        payload: { name: '风险消减措施', type: 'long_text' }
      });

      const first = await app.inject({ method: 'POST', url: '/api/workspace/primary-dashboard' });
      expect(first.statusCode).toBe(200);
      expect(first.json().dashboard.name).toBe('项目工作台');
      expect(first.json().blocks).toHaveLength(2);
      expect(
        first
          .json()
          .blocks.map((block: { view: { database: { name: string } } }) => block.view.database.name)
      ).toEqual(['需求跟踪', '关键风险']);

      const second = await app.inject({ method: 'POST', url: '/api/workspace/primary-dashboard' });
      expect(second.statusCode).toBe(200);
      expect(second.json().blocks).toHaveLength(2);

      const renamed = await app.inject({
        method: 'PATCH',
        url: `/api/databases/${risks.id}`,
        payload: { name: '重点风险' }
      });
      expect(renamed.statusCode).toBe(200);
      expect(renamed.json().name).toBe('重点风险');
    } finally {
      await app.close();
      persistence.close();
    }
  });
});
