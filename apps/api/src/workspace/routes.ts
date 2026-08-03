import { z, ZodError } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Persistence } from '../persistence/database.js';
import { ResourceNotFoundError, WorkspaceService } from './service.js';

const databaseParamsSchema = z.object({ databaseId: z.string().trim().min(1).max(120) });
const fieldParamsSchema = z.object({ fieldId: z.string().trim().min(1).max(120) });
const recordParamsSchema = z.object({ recordId: z.string().trim().min(1).max(120) });
const viewParamsSchema = z.object({ viewId: z.string().trim().min(1).max(120) });

export function registerWorkspaceRoutes(app: FastifyInstance, persistence: Persistence): void {
  const service = new WorkspaceService(persistence);

  app.get('/api/databases', async () => service.listDatabases());
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
      return reply.code(400).send({ error: 'validation_error', details: error.issues });
    }
    if (error instanceof ResourceNotFoundError) {
      return reply.code(404).send({ error: 'not_found', message: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'internal_error' });
  });
}
