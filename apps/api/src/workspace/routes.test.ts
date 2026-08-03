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
          options: [
            { id: 'in-progress', label: '进行中', color: 'blue' },
            { id: 'closed', label: '已关闭', color: 'green' }
          ],
          completion: { completedOptionIds: ['closed'] }
        }
      });
      const duplicateCompletionFieldResponse = await app.inject({
        method: 'POST',
        url: `/api/databases/${database.id}/fields`,
        payload: {
          name: '另一完成状态',
          type: 'status',
          config: {
            version: 1,
            options: [{ id: 'done', label: '完成' }],
            completion: { completedOptionIds: ['done'] }
          }
        }
      });
      expect(duplicateCompletionFieldResponse.statusCode).toBe(400);
      expect(duplicateCompletionFieldResponse.json().message).toContain('only one status field');

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

      const updatedRecordResponse = await app.inject({
        method: 'PATCH',
        url: `/api/records/${firstRecordResponse.json().id as string}`,
        payload: {
          values: {
            [nameField.id]: '支持统一认证',
            [statusField.id]: 'in-progress'
          }
        }
      });
      expect(updatedRecordResponse.statusCode).toBe(200);
      expect(updatedRecordResponse.json()).toMatchObject({
        sequenceNumber: 1,
        values: { [nameField.id]: '支持统一认证', [statusField.id]: 'in-progress' }
      });

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
        [nameField.id]: '支持统一认证',
        [statusField.id]: 'in-progress'
      });

      const archiveRecordResponse = await app.inject({
        method: 'POST',
        url: `/api/records/${firstRecordResponse.json().id as string}/archive`
      });
      expect(archiveRecordResponse.statusCode).toBe(200);
      expect(
        (await app.inject({ method: 'GET', url: `/api/databases/${database.id}` })).json().records
      ).toHaveLength(1);
      const restoreRecordResponse = await app.inject({
        method: 'POST',
        url: `/api/records/${firstRecordResponse.json().id as string}/restore`
      });
      expect(restoreRecordResponse.statusCode).toBe(200);

      const createViewResponse = await app.inject({
        method: 'POST',
        url: `/api/databases/${database.id}/views`,
        payload: {
          name: '进行中需求',
          config: {
            version: 1,
            visibleFieldIds: [nameField.id, statusField.id],
            filter: {
              kind: 'condition',
              fieldId: statusField.id,
              operator: 'equals',
              value: 'in-progress'
            },
            sorts: [{ fieldId: nameField.id, direction: 'ascending' }],
            includeArchived: false
          }
        }
      });
      expect(createViewResponse.statusCode).toBe(201);
      const view = createViewResponse.json() as { id: string };
      const viewResponse = await app.inject({ method: 'GET', url: `/api/views/${view.id}` });
      expect(viewResponse.statusCode).toBe(200);
      expect(viewResponse.json().records).toHaveLength(1);

      await app.inject({
        method: 'PATCH',
        url: `/api/records/${secondRecordResponse.json().id as string}`,
        payload: {
          values: { [nameField.id]: '已关闭需求', [statusField.id]: 'closed' }
        }
      });
      const allViewResponse = await app.inject({
        method: 'POST',
        url: `/api/databases/${database.id}/views`,
        payload: {
          name: '全部需求',
          config: {
            version: 1,
            visibleFieldIds: [nameField.id],
            filter: null,
            sorts: [],
            includeArchived: false
          }
        }
      });
      expect(allViewResponse.statusCode).toBe(201);
      const allView = allViewResponse.json() as { id: string };

      const dashboardResponse = await app.inject({
        method: 'POST',
        url: '/api/dashboards',
        payload: { name: '项目周报' }
      });
      expect(dashboardResponse.statusCode).toBe(201);
      const dashboard = dashboardResponse.json() as { id: string };
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/dashboards/${dashboard.id}/blocks`,
            payload: { viewId: view.id, description: '<重点需求>' }
          })
        ).statusCode
      ).toBe(201);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/dashboards/${dashboard.id}/blocks`,
            payload: { viewId: allView.id }
          })
        ).statusCode
      ).toBe(201);
      const previewResponse = await app.inject({
        method: 'GET',
        url: `/api/dashboards/${dashboard.id}/report-preview?title=第32周周报`
      });
      expect(previewResponse.statusCode).toBe(200);
      expect(previewResponse.json().model.sections[0].rows).toHaveLength(1);
      expect(previewResponse.json().model.sections[1].rows).toHaveLength(2);
      expect(previewResponse.json().html).toContain('进行中');
      expect(previewResponse.json().html).toContain('&lt;重点需求&gt;');
      expect(previewResponse.json().html).not.toContain('in-progress');

      const withoutCompletedResponse = await app.inject({
        method: 'GET',
        url: `/api/dashboards/${dashboard.id}/report-preview?includeCompleted=false`
      });
      expect(withoutCompletedResponse.statusCode).toBe(200);
      expect(withoutCompletedResponse.json().model.includeCompleted).toBe(false);
      expect(withoutCompletedResponse.json().model.sections[1].rows).toHaveLength(1);
      expect(withoutCompletedResponse.json().html).not.toContain('已关闭需求');
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
