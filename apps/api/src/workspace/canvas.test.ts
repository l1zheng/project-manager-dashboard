import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
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
          config: { version: 1, title: '项目架构图', caption: '当前架构基线' }
        }
      });
      expect(imageBlock.statusCode).toBe(201);
      expect(imageBlock.json()).toMatchObject({ kind: 'image', asset: null });

      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9xkAAAAASUVORK5CYII=',
        'base64'
      );
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

      const presentation = await app.inject({
        method: 'GET',
        url: `/api/dashboards/${first.json().dashboard.id}/export/presentation.xlsx?includeEmptySections=true`
      });
      expect(presentation.statusCode).toBe(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(presentation.rawPayload as never);
      const reportSheet = workbook.worksheets[0]!;
      expect(reportSheet.getCell('A4').value).toBe('项目架构图');
      expect(reportSheet.getImages()).toHaveLength(1);
      expect(findWorkbookCellRow(reportSheet, '项目架构图')).toBeLessThan(
        findWorkbookCellRow(reportSheet, '关键风险')
      );
      expect(findWorkbookCellRow(reportSheet, '关键风险')).toBeLessThan(
        findWorkbookCellRow(reportSheet, '本周摘要')
      );

      const outlookHtml = await app.inject({
        method: 'GET',
        url: `/api/dashboards/${first.json().dashboard.id}/export/outlook.html?includeEmptySections=true`
      });
      expect(outlookHtml.statusCode).toBe(200);
      expect(outlookHtml.body).toContain('data:image/png;base64,');
      expect(outlookHtml.body.indexOf('项目架构图')).toBeLessThan(
        outlookHtml.body.indexOf('关键风险')
      );

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

  it('repairs archived field references before loading mixed content modules', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'project-manager-stale-view-'));
    temporaryRoots.push(rootDirectory);
    const persistence = await openPersistence({
      dataPaths: resolveDataPaths({ environment: { PM_DATA_DIR: rootDirectory } })
    });
    const app = await buildApp({ persistence });

    try {
      const database = (
        await app.inject({
          method: 'POST',
          url: '/api/databases',
          payload: { name: '需求跟踪' }
        })
      ).json() as { id: string };
      const field = (
        await app.inject({
          method: 'POST',
          url: `/api/databases/${database.id}/fields`,
          payload: { name: '需求描述', type: 'long_text' }
        })
      ).json() as { id: string };
      const dashboard = await app.inject({
        method: 'POST',
        url: '/api/workspace/primary-dashboard'
      });
      const dashboardId = dashboard.json().dashboard.id as string;
      const viewId = dashboard.json().blocks[0].view.view.id as string;

      const archived = await app.inject({
        method: 'POST',
        url: `/api/fields/${field.id}/archive`
      });
      expect(archived.statusCode).toBe(200);

      // Recreate the corruption produced by older builds: a saved view still
      // points at the field after it was archived.
      persistence.sqlite.prepare('UPDATE views SET config_json = ? WHERE id = ?').run(
        JSON.stringify({
          version: 1,
          visibleFieldIds: [field.id],
          fieldWidths: { [field.id]: 260 },
          fieldPresentation: {},
          filter: { kind: 'condition', fieldId: field.id, operator: 'contains', value: 'x' },
          sorts: [],
          includeArchived: false
        }),
        viewId
      );

      const textBlock = await app.inject({
        method: 'POST',
        url: `/api/dashboards/${dashboardId}/blocks`,
        payload: {
          kind: 'text',
          config: { version: 1, title: '本周摘要', body: '继续推进。' }
        }
      });
      expect(textBlock.statusCode).toBe(201);

      const imageBlock = await app.inject({
        method: 'POST',
        url: `/api/dashboards/${dashboardId}/blocks`,
        payload: { kind: 'image', config: { version: 1, title: null, caption: null } }
      });
      expect(imageBlock.statusCode).toBe(201);

      const repaired = await app.inject({
        method: 'GET',
        url: `/api/dashboards/${dashboardId}`
      });
      expect(repaired.statusCode).toBe(200);
      expect(repaired.json().blocks.map((block: { kind: string }) => block.kind)).toEqual([
        'table_view',
        'text',
        'image'
      ]);
      expect(repaired.json().blocks[0].view.view.config.visibleFieldIds).toEqual([]);
    } finally {
      await app.close();
      persistence.close();
    }
  });
});

function findWorkbookCellRow(worksheet: ExcelJS.Worksheet, value: string): number {
  for (let row = 1; row <= worksheet.rowCount; row += 1) {
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      if (worksheet.getCell(row, column).value === value) return row;
    }
  }
  throw new Error(`Expected workbook value: ${value}`);
}
