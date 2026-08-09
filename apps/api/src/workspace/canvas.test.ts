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

      const requirementField = (
        await app.inject({
          method: 'POST',
          url: `/api/databases/${requirements.id}/fields`,
          payload: { name: '需求名称', type: 'short_text' }
        })
      ).json() as { id: string };
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

      const report = await app.inject({
        method: 'GET',
        url: `/api/dashboards/${first.json().dashboard.id}/report-preview?includeEmptySections=true`
      });
      expect(report.statusCode).toBe(200);
      expect(
        report.json().model.sections.map((section: { title: string }) => section.title)
      ).toEqual(['需求跟踪', '关键风险']);
      expect(report.json().model.includeEmptySections).toBe(true);

      const sourceRecord = await app.inject({
        method: 'POST',
        url: `/api/databases/${requirements.id}/records`,
        payload: { values: { [requirementField.id]: '支持周报导出模板' } }
      });
      expect(sourceRecord.statusCode).toBe(201);
      const copiedRecord = await app.inject({
        method: 'POST',
        url: `/api/records/${sourceRecord.json().id}/duplicate`
      });
      expect(copiedRecord.statusCode).toBe(201);
      expect(copiedRecord.json()).toMatchObject({
        databaseId: requirements.id,
        values: { [requirementField.id]: '支持周报导出模板' }
      });

      const copiedTable = await app.inject({
        method: 'POST',
        url: `/api/dashboard-blocks/${first.json().blocks[0].id}/duplicate-table`
      });
      expect(copiedTable.statusCode).toBe(201);
      expect(copiedTable.json()).toMatchObject({
        kind: 'table_view',
        view: { database: { name: '需求跟踪 副本' } }
      });
      expect(copiedTable.json().view.records).toHaveLength(2);

      const archivedCopy = await app.inject({
        method: 'POST',
        url: `/api/dashboard-blocks/${copiedTable.json().id}/archive`
      });
      expect(archivedCopy.statusCode).toBe(200);

      const textBlock = await app.inject({
        method: 'POST',
        url: `/api/dashboards/${first.json().dashboard.id}/blocks`,
        payload: {
          kind: 'text',
          config: { version: 1, title: '本周摘要', body: '按计划推进联调。' }
        }
      });
      expect(textBlock.statusCode).toBe(201);
      expect(textBlock.json()).toMatchObject({
        kind: 'text',
        viewId: null,
        config: { version: 1, title: '本周摘要', body: '按计划推进联调。' }
      });

      const imageBlock = await app.inject({
        method: 'POST',
        url: `/api/dashboards/${first.json().dashboard.id}/blocks`,
        payload: {
          kind: 'image',
          mediaAssetId: null,
          config: { version: 1, title: null, caption: null }
        }
      });
      expect(imageBlock.statusCode).toBe(201);
      expect(imageBlock.json()).toMatchObject({ kind: 'image', asset: null });

      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      const uploadedImage = await app.inject({
        method: 'PUT',
        url: `/api/dashboard-blocks/${imageBlock.json().id}/image`,
        headers: {
          'content-type': 'image/png',
          'x-project-manager-filename': encodeURIComponent('架构图.png')
        },
        payload: png
      });
      expect(uploadedImage.statusCode).toBe(200);
      expect(uploadedImage.json()).toMatchObject({
        kind: 'image',
        asset: {
          mimeType: 'image/png',
          byteLength: png.length,
          originalFilename: '架构图.png'
        }
      });
      const imageContent = await app.inject({
        method: 'GET',
        url: uploadedImage.json().asset.contentUrl
      });
      expect(imageContent.statusCode).toBe(200);
      expect(imageContent.headers['content-type']).toBe('image/png');
      expect(imageContent.headers['x-content-type-options']).toBe('nosniff');
      expect(imageContent.rawPayload).toEqual(png);

      const rejectedImage = await app.inject({
        method: 'PUT',
        url: `/api/dashboard-blocks/${imageBlock.json().id}/image`,
        headers: { 'content-type': 'image/jpeg' },
        payload: png
      });
      expect(rejectedImage.statusCode).toBe(400);
      expect(rejectedImage.json().error).toBe('image_signature_invalid');

      const mixedDashboard = await app.inject({
        method: 'GET',
        url: `/api/dashboards/${first.json().dashboard.id}`
      });
      expect(mixedDashboard.json().blocks.map((block: { kind: string }) => block.kind)).toEqual([
        'table_view',
        'table_view',
        'text',
        'image'
      ]);

      const reordered = await app.inject({
        method: 'PUT',
        url: `/api/dashboards/${first.json().dashboard.id}/block-order`,
        payload: {
          blockIds: [
            imageBlock.json().id,
            first.json().blocks[1].id,
            textBlock.json().id,
            first.json().blocks[0].id
          ]
        }
      });
      expect(reordered.statusCode).toBe(200);
      expect(reordered.json().blocks.map((block: { id: string }) => block.id)).toEqual([
        imageBlock.json().id,
        first.json().blocks[1].id,
        textBlock.json().id,
        first.json().blocks[0].id
      ]);

      const mixedReport = await app.inject({
        method: 'GET',
        url: `/api/dashboards/${first.json().dashboard.id}/report-preview?includeEmptySections=true`
      });
      expect(mixedReport.json().model.blocks.map((block: { kind: string }) => block.kind)).toEqual([
        'image',
        'table',
        'text',
        'table'
      ]);

      const second = await app.inject({ method: 'POST', url: '/api/workspace/primary-dashboard' });
      expect(second.statusCode).toBe(200);
      expect(second.json().blocks).toHaveLength(4);

      const renamed = await app.inject({
        method: 'PATCH',
        url: `/api/databases/${risks.id}`,
        payload: { name: '重点风险' }
      });
      expect(renamed.statusCode).toBe(200);
      expect(renamed.json().name).toBe('重点风险');

      await app.inject({
        method: 'POST',
        url: `/api/databases/${requirements.id}/records`,
        payload: { values: { [requirementField.id]: '支持统一认证' } }
      });
      const preservedText = await app.inject({
        method: 'PATCH',
        url: `/api/fields/${requirementField.id}`,
        payload: { type: 'long_text', config: { version: 1 } }
      });
      expect(preservedText.statusCode).toBe(200);
      expect(preservedText.json().type).toBe('long_text');

      const blockedConversion = await app.inject({
        method: 'PATCH',
        url: `/api/fields/${requirementField.id}`,
        payload: { type: 'number', config: { version: 1 } }
      });
      expect(blockedConversion.statusCode).toBe(409);
      expect(blockedConversion.json().error).toBe('field_values_require_clear');

      const clearedConversion = await app.inject({
        method: 'PATCH',
        url: `/api/fields/${requirementField.id}`,
        payload: { type: 'number', config: { version: 1 }, clearValues: true }
      });
      expect(clearedConversion.statusCode).toBe(200);
      expect(clearedConversion.json().type).toBe('number');
      const requirementsDetail = await app.inject({
        method: 'GET',
        url: `/api/databases/${requirements.id}`
      });
      expect(requirementsDetail.json().records[0].values).not.toHaveProperty(requirementField.id);
    } finally {
      await app.close();
      persistence.close();
    }
  });
});
