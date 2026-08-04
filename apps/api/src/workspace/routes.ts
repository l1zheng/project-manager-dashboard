import { z, ZodError } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  buildEditableWorkbook,
  buildPresentationWorkbook,
  buildReportModel,
  renderOutlookReport,
  renderReportHtml
} from '@project-manager/export';
import type { Persistence } from '../persistence/database.js';
import {
  createDefaultMailDraftAdapter,
  OutlookDraftError,
  type MailDraftAdapter
} from '../outlook/adapter.js';
import { ResourceNotFoundError, WorkspaceService } from './service.js';

const databaseParamsSchema = z.object({ databaseId: z.string().trim().min(1).max(120) });
const fieldParamsSchema = z.object({ fieldId: z.string().trim().min(1).max(120) });
const recordParamsSchema = z.object({ recordId: z.string().trim().min(1).max(120) });
const viewParamsSchema = z.object({ viewId: z.string().trim().min(1).max(120) });
const dashboardParamsSchema = z.object({ dashboardId: z.string().trim().min(1).max(120) });
const blockParamsSchema = z.object({ blockId: z.string().trim().min(1).max(120) });
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

  app.get('/api/databases', async () => service.listDatabases());
  app.get('/api/dashboards', async () => service.listDashboards());
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
    const workbook = await buildPresentationWorkbook(model);
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
    const report = renderOutlookReport(reportModelForRequest(service, request));
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
    const report = renderOutlookReport(reportModelForRequest(service, request));
    return mailDraftAdapter.createDraft({
      subject: report.subject,
      htmlFragment: report.htmlFragment
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
  app.post('/api/databases', async (request, reply) => {
    const database = service.createDatabase(request.body);
    return reply.code(201).send(database);
  });
  app.get('/api/databases/:databaseId', async (request) => {
    return service.getDatabase(databaseParamsSchema.parse(request.params).databaseId);
  });
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
    if (error instanceof OutlookDraftError) {
      const statusCode = error.code === 'platform_unsupported' ? 501 : 503;
      return reply.code(statusCode).send({
        error: error.code,
        message: error.message,
        fallbacks: ['clipboard', 'html_download']
      });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'internal_error' });
  });
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
