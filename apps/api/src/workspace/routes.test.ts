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

describe('workspace API', () => {
  it('keeps record values when a field is renamed', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'project-manager-workspace-'));
    temporaryRoots.push(rootDirectory);
    const persistence = await openPersistence({
      dataPaths: resolveDataPaths({ environment: { PM_DATA_DIR: rootDirectory } })
    });
    const app = buildApp({ persistence });

    try {
      const databaseResponse = await app.inject({
        method: 'POST',
        url: '/api/databases',
        payload: { name: '需求跟踪', description: '面向本周交付的需求' }
      });
      expect(databaseResponse.statusCode).toBe(201);
      const database = databaseResponse.json() as { id: string; name: string };
      expect(database.name).toBe('需求跟踪');

      const nameField = await createField(app, database.id, {
        name: '需求名称',
        type: 'short_text'
      });
      const statusField = await createField(app, database.id, {
        name: '状态',
        type: 'status',
        config: {
          version: 1,
          options: [{ id: 'in-progress', label: '进行中', color: 'blue' }]
        }
      });

      const invalidRecordResponse = await app.inject({
        method: 'POST',
        url: `/api/databases/${database.id}/records`,
        payload: { values: { [statusField.id]: 'unknown-status' } }
      });
      expect(invalidRecordResponse.statusCode).toBe(400);

      const firstRecordResponse = await app.inject({
        method: 'POST',
        url: `/api/databases/${database.id}/records`,
        payload: {
          values: {
            [nameField.id]: '支持单点登录',
            [statusField.id]: 'in-progress'
          }
        }
      });
      expect(firstRecordResponse.statusCode).toBe(201);
      expect(firstRecordResponse.json()).toMatchObject({
        sequenceNumber: 1,
        values: { [nameField.id]: '支持单点登录', [statusField.id]: 'in-progress' }
      });

      const secondRecordResponse = await app.inject({
        method: 'POST',
        url: `/api/databases/${database.id}/records`,
        payload: { values: { [nameField.id]: '支持自动序号' } }
      });
      expect(secondRecordResponse.json()).toMatchObject({ sequenceNumber: 2 });

      const renamedFieldResponse = await app.inject({
        method: 'PATCH',
        url: `/api/fields/${nameField.id}`,
        payload: { name: '需求标题' }
      });
      expect(renamedFieldResponse.statusCode).toBe(200);
      expect(renamedFieldResponse.json()).toMatchObject({ id: nameField.id, name: '需求标题' });

      const detailResponse = await app.inject({
        method: 'GET',
        url: `/api/databases/${database.id}`
      });
      expect(detailResponse.statusCode).toBe(200);
      const detail = detailResponse.json() as {
        database: { name: string };
        fields: Array<{ id: string; name: string }>;
        records: Array<{ values: Record<string, unknown> }>;
      };
      expect(detail.database.name).toBe('需求跟踪');
      expect(detail.fields.find((field) => field.id === nameField.id)).toMatchObject({
        name: '需求标题'
      });
      expect(detail.records[0]?.values).toEqual({
        [nameField.id]: '支持单点登录',
        [statusField.id]: 'in-progress'
      });
    } finally {
      await app.close();
    }
  });
});

async function createField(
  app: ReturnType<typeof buildApp>,
  databaseId: string,
  payload: Record<string, unknown>
) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/databases/${databaseId}/fields`,
    payload
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; name: string };
}
