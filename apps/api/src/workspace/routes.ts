import { z, ZodError } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  buildEditableWorkbook,
  buildPresentationWorkbook,
  buildReportModel,
  renderOutlookReport,
  renderReportHtml,
  type ReportModel
} from '@project-manager/export';
import type { Persistence } from '../persistence/database.js';
import {
  createDefaultMailDraftAdapter,
  OutlookDraftError,
  type MailDraftAdapter,
  type MailDraftInlineImage
} from '../outlook/adapter.js';
import { createWorkspaceBackup } from '../persistence/backups.js';
import {
  confirmWorkspaceRestore,
  discardStagedRestore,
  inspectWorkspaceBackup,
  isWorkspaceRestorePending,
  maximumRestoreArchiveBytes,
  RestoreValidationError
} from '../persistence/restore.js';
import {
  FieldValuesRequireClearError,
  ResourceNotFoundError,
  WorkspaceService
} from './service.js';
import {
  ImageAssetValidationError,
  maximumImageAssetBytes,
  supportedImageMimeTypes
} from './media.js';

const databaseParamsSchema = z.object({ databaseId: z.string().trim().min(1).max(120) });
const fieldParamsSchema = z.object({ fieldId: z.string().trim().min(1).max(120) });
const recordParamsSchema = z.object({ recordId: z.string().trim().min(1).max(120) });
const viewParamsSchema = z.object({ viewId: z.string().trim().min(1).max(120) });
const dashboardParamsSchema = z.object({ dashboardId: z.string().trim().min(1).max(120) });
const blockParamsSchema = z.object({ blockId: z.string().trim().min(1).max(120) });
const confirmRestoreSchema = z
  .object({
    restoreId: z.uuid(),
    confirmation: z.literal('replace-workspace')
  })
  .strict();
const reportPreviewQuerySchema = z.object({
  title: z.string().trim().max(120).optional(),
  period: z.string().trim().max(120).optional(),
  density: z.enum(['compact', 'comfortable']).optional(),
  includeEmptySections: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  includeCompleted: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  highlightStatus: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
});

export function registerWorkspaceRoutes(
  app: FastifyInstance,
  persistence: Persistence,
  options: { mailDraftAdapter?: MailDraftAdapter } = {}
): void {
  const service = new WorkspaceService(persistence);
  const mailDraftAdapter = options.mailDraftAdapter ?? createDefaultMailDraftAdapter();

  app.addContentTypeParser(
    'application/vnd.project-manager.workspace-backup',
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body)
  );
  for (const mimeType of supportedImageMimeTypes) {
    app.addContentTypeParser(
      mimeType,
      { parseAs: 'buffer', bodyLimit: maximumImageAssetBytes },
      (_request, body, done) => done(null, body)
    );
  }

  app.addHook('preHandler', async (request, reply) => {
    if (!isWorkspaceMutation(request.method, request.url)) return;
    if (!(await isWorkspaceRestorePending(persistence.paths))) return;
    return reply.code(409).send({
      error: 'workspace_restore_restart_required',
      message: '工作区恢复已经准备完成。请重启应用后再修改数据。'
    });
  });

  app.get('/api/databases', async () => service.listDatabases());
  app.get('/api/workspace/backup', async (_request, reply) => {
    const workspace = persistence.sqlite
      .prepare('SELECT id, name FROM workspaces ORDER BY created_at ASC LIMIT 1')
      .get() as { id: string; name: string } | undefined;
    const backup = await createWorkspaceBackup(persistence.sqlite, persistence.paths, {
      migrationState: persistence.migrationState,
      applicationVersion: process.env.PM_APP_VERSION?.trim() || '0.1.0',
      workspace: workspace ?? null
    });
    return reply
      .header(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(backup.filename)}`
      )
      .header('x-content-type-options', 'nosniff')
      .type('application/zip')
      .send(backup.archive);
  });
  app.post(
    '/api/workspace/restore/inspect',
    { bodyLimit: maximumRestoreArchiveBytes },
    async (request, reply) => {
      if (!Buffer.isBuffer(request.body)) {
        throw new RestoreValidationError('archive_body_required', '请选择 .pmdbackup 备份文件。');
      }
      const inspection = await inspectWorkspaceBackup(
        request.body,
        persistence.paths,
        persistence.migrationsFolder
      );
      return reply.code(201).send(inspection);
    }
  );
  app.post('/api/workspace/restore/confirm', async (request, reply) => {
    if (request.headers['x-project-manager-action'] !== 'confirm-workspace-restore') {
      return reply.code(403).send({
        error: 'action_confirmation_required',
        message: '替换当前工作区需要来自本应用的明确确认。'
      });
    }
    const command = confirmRestoreSchema.parse(request.body);
    return confirmWorkspaceRestore(
      command.restoreId,
      persistence.sqlite,
      persistence.paths,
      persistence.migrationsFolder
    );
  });
  app.delete('/api/workspace/restore/:restoreId', async (request, reply) => {
    const restoreId = z.object({ restoreId: z.uuid() }).parse(request.params).restoreId;
    await discardStagedRestore(persistence.paths, restoreId);
    return reply.code(204).send();
  });
  app.get('/api/dashboards', async () => service.listDashboards());
  app.post('/api/workspace/primary-dashboard', async () => service.ensurePrimaryDashboard());
  app.post('/api/workspace/tables', async (request, reply) =>
    reply.code(201).send(service.createWorkspaceTable(request.body))
  );
  app.post('/api/workspace/content-blocks', async (request, reply) =>
    reply.code(201).send(service.createWorkspaceContentBlock(request.body))
  );
  app.post('/api/dashboards', async (request, reply) =>
    reply.code(201).send(service.createDashboard(request.body))
  );
  app.get('/api/dashboards/:dashboardId', async (request) =>
    service.getDashboard(dashboardParamsSchema.parse(request.params).dashboardId)
  );
  app.get('/api/dashboards/:dashboardId/report-preview', async (request) => {
    const model = reportModelForRequest(service, request);
    return { model, html: renderReportHtml(model) };
  });
  app.get('/api/dashboards/:dashboardId/export/editable.xlsx', async (request, reply) => {
    const model = reportModelForRequest(service, request);
    const workbook = await buildEditableWorkbook(model);
    return reply
      .header(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(`${safeExportFilename(model.title)}-可编辑数据.xlsx`)}`
      )
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .send(Buffer.from(workbook));
  });
  app.get('/api/dashboards/:dashboardId/export/presentation.xlsx', async (request, reply) => {
    const model = reportModelForRequest(service, request);
    const workbook = await buildPresentationWorkbook(model, {
      resolveImage: async (assetId) => {
        const asset = service.getMediaAssetContent(assetId);
        return { bytes: asset.content, mimeType: asset.mimeType };
      }
    });
    return reply
      .header(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(`${safeExportFilename(model.title)}-展示版.xlsx`)}`
      )
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .send(Buffer.from(workbook));
  });
  app.get('/api/integrations/outlook', async () => mailDraftAdapter.probe());
  app.get('/api/dashboards/:dashboardId/export/outlook.html', async (request, reply) => {
    const model = reportModelForRequest(service, request);
    const images = resolveReportImages(model, service);
    const report = renderOutlookReport(model, {
      imageSource: (block) => {
        const image = block.asset ? images.get(block.asset.id) : undefined;
        return image
          ? `data:${image.mimeType};base64,${image.content.toString('base64')}`
          : undefined;
      }
    });
    return reply
      .header(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(`${safeExportFilename(report.subject)}-Outlook报告.html`)}`
      )
      .header(
        'content-security-policy',
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:"
      )
      .type('text/html; charset=utf-8')
      .send(report.htmlDocument);
  });
  app.post('/api/dashboards/:dashboardId/export/outlook-draft', async (request, reply) => {
    if (request.headers['x-project-manager-action'] !== 'create-outlook-draft') {
      return reply.code(403).send({
        error: 'action_confirmation_required',
        message: '创建 Outlook 草稿需要来自本应用的明确操作。'
      });
    }
    const model = reportModelForRequest(service, request);
    const images = resolveReportImages(model, service);
    const report = renderOutlookReport(model, {
      imageSource: (block) => (block.asset ? `cid:${contentIdForAsset(block.asset.id)}` : undefined)
    });
    return mailDraftAdapter.createDraft({
      subject: report.subject,
      htmlFragment: report.htmlFragment,
      inlineImages: [...images.entries()].map(([assetId, image]) => ({
        contentId: contentIdForAsset(assetId),
        mimeType: image.mimeType,
        content: image.content
      }))
    });
  });
  app.patch('/api/dashboards/:dashboardId', async (request) =>
    service.updateDashboard(dashboardParamsSchema.parse(request.params).dashboardId, request.body)
  );
  app.post('/api/dashboards/:dashboardId/blocks', async (request, reply) =>
    reply
      .code(201)
      .send(
        service.createDashboardBlock(
          dashboardParamsSchema.parse(request.params).dashboardId,
          request.body
        )
      )
  );
  app.patch('/api/dashboard-blocks/:blockId', async (request) =>
    service.updateDashboardBlock(blockParamsSchema.parse(request.params).blockId, request.body)
  );
  app.post('/api/dashboard-blocks/:blockId/archive', async (request) =>
    service.archiveDashboardBlock(blockParamsSchema.parse(request.params).blockId)
  );
  app.post('/api/dashboard-blocks/:blockId/duplicate-table', async (request, reply) =>
    reply
      .code(201)
      .send(service.duplicateTableBlock(blockParamsSchema.parse(request.params).blockId))
  );
  app.put('/api/dashboards/:dashboardId/block-order', async (request) =>
    service.reorderDashboardBlocks(
      dashboardParamsSchema.parse(request.params).dashboardId,
      request.body
    )
  );
  app.put(
    '/api/dashboard-blocks/:blockId/image',
    { bodyLimit: maximumImageAssetBytes },
    async (request) => {
      if (!Buffer.isBuffer(request.body)) {
        throw new ImageAssetValidationError('image_body_required', '请选择图片文件。');
      }
      return service.replaceImageBlockAsset(blockParamsSchema.parse(request.params).blockId, {
        content: request.body,
        mimeType: request.headers['content-type'] ?? '',
        originalFilename: decodeImageFilename(request.headers['x-project-manager-filename'])
      });
    }
  );
  app.get('/api/media-assets/:mediaAssetId/content', async (request, reply) => {
    const mediaAssetId = z
      .object({ mediaAssetId: z.string().trim().min(1).max(120) })
      .parse(request.params).mediaAssetId;
    const asset = service.getMediaAssetContent(mediaAssetId);
    return reply
      .header('content-length', asset.byteLength)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, no-store')
      .type(asset.mimeType)
      .send(asset.content);
  });
  app.post('/api/databases', async (request, reply) => {
    const database = service.createDatabase(request.body);
    return reply.code(201).send(database);
  });
  app.get('/api/databases/:databaseId', async (request) => {
    return service.getDatabase(databaseParamsSchema.parse(request.params).databaseId);
  });
  app.patch('/api/databases/:databaseId', async (request) =>
    service.updateDatabase(databaseParamsSchema.parse(request.params).databaseId, request.body)
  );
  app.get('/api/databases/:databaseId/views', async (request) =>
    service.listViews(databaseParamsSchema.parse(request.params).databaseId)
  );
  app.post('/api/databases/:databaseId/views', async (request, reply) => {
    const view = service.createView(
      databaseParamsSchema.parse(request.params).databaseId,
      request.body
    );
    return reply.code(201).send(view);
  });
  app.get('/api/views/:viewId', async (request) =>
    service.getView(viewParamsSchema.parse(request.params).viewId)
  );
  app.patch('/api/views/:viewId', async (request) =>
    service.updateView(viewParamsSchema.parse(request.params).viewId, request.body)
  );
  app.post('/api/views/:viewId/archive', async (request) =>
    service.archiveView(viewParamsSchema.parse(request.params).viewId)
  );
  app.post('/api/views/:viewId/restore', async (request) =>
    service.restoreView(viewParamsSchema.parse(request.params).viewId)
  );
  app.post('/api/databases/:databaseId/fields', async (request, reply) => {
    const field = service.createField(
      databaseParamsSchema.parse(request.params).databaseId,
      request.body
    );
    return reply.code(201).send(field);
  });
  app.patch('/api/fields/:fieldId', async (request) => {
    return service.updateField(fieldParamsSchema.parse(request.params).fieldId, request.body);
  });
  app.post('/api/databases/:databaseId/records', async (request, reply) => {
    const record = service.createRecord(
      databaseParamsSchema.parse(request.params).databaseId,
      request.body
    );
    return reply.code(201).send(record);
  });
  app.patch('/api/records/:recordId', async (request) => {
    return service.updateRecord(recordParamsSchema.parse(request.params).recordId, request.body);
  });
  app.post('/api/records/:recordId/duplicate', async (request, reply) =>
    reply.code(201).send(service.duplicateRecord(recordParamsSchema.parse(request.params).recordId))
  );
  app.post('/api/databases/:databaseId/archive', async (request) =>
    service.archiveDatabase(databaseParamsSchema.parse(request.params).databaseId)
  );
  app.post('/api/databases/:databaseId/restore', async (request) =>
    service.restoreDatabase(databaseParamsSchema.parse(request.params).databaseId)
  );
  app.post('/api/fields/:fieldId/archive', async (request) =>
    service.archiveField(fieldParamsSchema.parse(request.params).fieldId)
  );
  app.post('/api/fields/:fieldId/restore', async (request) =>
    service.restoreField(fieldParamsSchema.parse(request.params).fieldId)
  );
  app.post('/api/records/:recordId/archive', async (request) =>
    service.archiveRecord(recordParamsSchema.parse(request.params).recordId)
  );
  app.post('/api/records/:recordId/restore', async (request) =>
    service.restoreRecord(recordParamsSchema.parse(request.params).recordId)
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation_error',
        message: error.issues[0]?.message ?? 'Validation failed.',
        details: error.issues
      });
    }
    if (error instanceof ResourceNotFoundError) {
      return reply.code(404).send({ error: 'not_found', message: error.message });
    }
    if (error instanceof FieldValuesRequireClearError) {
      return reply.code(409).send({ error: 'field_values_require_clear', message: error.message });
    }
    if (error instanceof OutlookDraftError) {
      const statusCode = error.code === 'platform_unsupported' ? 501 : 503;
      return reply.code(statusCode).send({
        error: error.code,
        message: error.message,
        fallbacks: ['clipboard', 'html_download']
      });
    }
    if (error instanceof RestoreValidationError) {
      return reply.code(400).send({ error: error.code, message: error.message });
    }
    if (error instanceof ImageAssetValidationError) {
      return reply.code(error.code === 'image_too_large' ? 413 : 400).send({
        error: error.code,
        message: error.message
      });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'internal_error' });
  });
}

function decodeImageFilename(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function reportModelForRequest(
  service: WorkspaceService,
  request: { params: unknown; query: unknown }
) {
  const source = service.getDashboard(dashboardParamsSchema.parse(request.params).dashboardId);
  const query = reportPreviewQuerySchema.parse(request.query);
  return buildReportModel(source, {
    title: query.title,
    period: query.period ?? null,
    density: query.density,
    includeEmptySections: query.includeEmptySections,
    includeCompleted: query.includeCompleted,
    highlightStatus: query.highlightStatus
  });
}

function safeExportFilename(title: string): string {
  return (
    Array.from(title)
      .map((character) => ('\\/*?:[]"<>|'.includes(character) ? '-' : character))
      .join('')
      .trim()
      .slice(0, 100) || '项目周报'
  );
}

function resolveReportImages(
  model: ReportModel,
  service: WorkspaceService
): Map<string, { content: Buffer; mimeType: MailDraftInlineImage['mimeType'] }> {
  const assets = new Map<string, { content: Buffer; mimeType: MailDraftInlineImage['mimeType'] }>();
  for (const block of model.blocks ?? []) {
    if (block.kind !== 'image' || !block.includeInExport || !block.asset) continue;
    if (assets.has(block.asset.id)) continue;
    const asset = service.getMediaAssetContent(block.asset.id);
    assets.set(block.asset.id, {
      content: asset.content,
      mimeType: toInlineImageMimeType(asset.mimeType)
    });
  }
  const totalBytes = [...assets.values()].reduce((total, image) => total + image.content.length, 0);
  if (assets.size > 20 || totalBytes > 30 * 1024 * 1024) {
    throw new ImageAssetValidationError(
      'image_too_large',
      '导出的图片总量超过安全限制，请减少图片数量或压缩图片。'
    );
  }
  return assets;
}

function toInlineImageMimeType(mimeType: string): MailDraftInlineImage['mimeType'] {
  if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/gif') {
    return mimeType;
  }
  throw new ImageAssetValidationError(
    'image_type_unsupported',
    '该图片格式无法用于 Excel 或 Outlook 导出。'
  );
}

function contentIdForAsset(assetId: string): string {
  return `pm-${assetId.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 100)}@local`;
}

function isWorkspaceMutation(method: string, url: string): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false;
  const pathname = url.split('?', 1)[0] ?? url;
  if (pathname.endsWith('/export/outlook-draft')) return false;
  if (method === 'DELETE' && pathname.startsWith('/api/workspace/restore/')) return false;
  return true;
}
