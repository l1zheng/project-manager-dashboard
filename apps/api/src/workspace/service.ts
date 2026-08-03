import { randomUUID } from 'node:crypto';
import {
  createDatabaseInputSchema,
  createDashboardBlockInputSchema,
  createDashboardInputSchema,
  createFieldInputSchema,
  createRecordInputSchema,
  createViewInputSchema,
  evaluateViewRecords,
  parseFieldConfig,
  parseViewConfig,
  updateFieldInputSchema,
  updateDashboardBlockInputSchema,
  updateDashboardInputSchema,
  updateViewInputSchema,
  validateRecordValues,
  type CreateRecordInput,
  type FieldDefinitionForValidation
} from '@project-manager/domain';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Persistence } from '../persistence/database.js';
import * as schema from '../persistence/schema.js';

const defaultWorkspaceSettingKey = 'default_workspace_id';
const defaultWorkspaceName = '我的项目管理';
const sortOrderStep = 1_000;

export class ResourceNotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} was not found.`);
    this.name = 'ResourceNotFoundError';
  }
}

export class WorkspaceService {
  constructor(private readonly persistence: Persistence) {}

  listDatabases() {
    const workspace = this.ensureDefaultWorkspace();
    return this.persistence.db
      .select()
      .from(schema.databases)
      .where(
        and(eq(schema.databases.workspaceId, workspace.id), isNull(schema.databases.archivedAt))
      )
      .orderBy(asc(schema.databases.sortOrder), asc(schema.databases.createdAt))
      .all();
  }

  listDashboards() {
    const workspace = this.ensureDefaultWorkspace();
    return this.persistence.db
      .select()
      .from(schema.dashboards)
      .where(
        and(eq(schema.dashboards.workspaceId, workspace.id), isNull(schema.dashboards.archivedAt))
      )
      .orderBy(asc(schema.dashboards.sortOrder), asc(schema.dashboards.createdAt))
      .all();
  }

  createDashboard(input: unknown) {
    const command = createDashboardInputSchema.parse(input);
    const workspace = this.ensureDefaultWorkspace();
    const now = new Date();
    const dashboard = {
      id: randomUUID(),
      workspaceId: workspace.id,
      name: command.name,
      description: normalizeNullable(command.description),
      sortOrder: this.nextSortOrder('dashboards', 'workspace_id', workspace.id),
      createdAt: now,
      updatedAt: now
    };
    this.persistence.db.insert(schema.dashboards).values(dashboard).run();
    return dashboard;
  }

  getDashboard(dashboardId: string) {
    const dashboard = this.requireActiveDashboard(dashboardId);
    const blocks = this.persistence.db
      .select()
      .from(schema.dashboardBlocks)
      .where(eq(schema.dashboardBlocks.dashboardId, dashboard.id))
      .orderBy(asc(schema.dashboardBlocks.sortOrder))
      .all()
      .map((block) => ({ ...block, view: this.getView(block.viewId) }));
    return { dashboard, blocks };
  }

  updateDashboard(dashboardId: string, input: unknown) {
    const command = updateDashboardInputSchema.parse(input);
    const dashboard = this.requireActiveDashboard(dashboardId);
    const updatedAt = new Date();
    this.persistence.db
      .update(schema.dashboards)
      .set({
        name: command.name ?? dashboard.name,
        description:
          command.description === undefined
            ? dashboard.description
            : normalizeNullable(command.description),
        updatedAt
      })
      .where(eq(schema.dashboards.id, dashboard.id))
      .run();
    return {
      ...dashboard,
      name: command.name ?? dashboard.name,
      description:
        command.description === undefined
          ? dashboard.description
          : normalizeNullable(command.description),
      updatedAt
    };
  }

  createDashboardBlock(dashboardId: string, input: unknown) {
    const command = createDashboardBlockInputSchema.parse(input);
    const dashboard = this.requireActiveDashboard(dashboardId);
    const view = this.requireActiveView(command.viewId);
    const now = new Date();
    const block = {
      id: randomUUID(),
      dashboardId: dashboard.id,
      viewId: view.id,
      titleOverride: normalizeNullable(command.titleOverride),
      description: normalizeNullable(command.description),
      sortOrder: this.nextSortOrder('dashboard_blocks', 'dashboard_id', dashboard.id),
      isCollapsed: command.isCollapsed ?? false,
      includeInExport: command.includeInExport ?? true,
      createdAt: now,
      updatedAt: now
    };
    this.persistence.db.insert(schema.dashboardBlocks).values(block).run();
    return block;
  }

  updateDashboardBlock(blockId: string, input: unknown) {
    const command = updateDashboardBlockInputSchema.parse(input);
    const block = this.requireDashboardBlock(blockId);
    this.requireActiveDashboard(block.dashboardId);
    const updatedAt = new Date();
    const next = {
      titleOverride:
        command.titleOverride === undefined
          ? block.titleOverride
          : normalizeNullable(command.titleOverride),
      description:
        command.description === undefined
          ? block.description
          : normalizeNullable(command.description),
      isCollapsed: command.isCollapsed ?? block.isCollapsed,
      includeInExport: command.includeInExport ?? block.includeInExport,
      sortOrder: command.sortOrder ?? block.sortOrder,
      updatedAt
    };
    this.persistence.db
      .update(schema.dashboardBlocks)
      .set(next)
      .where(eq(schema.dashboardBlocks.id, block.id))
      .run();
    return { ...block, ...next };
  }

  createDatabase(input: unknown) {
    const command = createDatabaseInputSchema.parse(input);
    const workspace = this.ensureDefaultWorkspace();
    const now = new Date();
    const database = {
      id: randomUUID(),
      workspaceId: workspace.id,
      name: command.name,
      description: normalizeNullable(command.description),
      color: normalizeNullable(command.color),
      sortOrder: this.nextDatabaseSortOrder(workspace.id),
      createdAt: now,
      updatedAt: now
    };

    this.persistence.db.insert(schema.databases).values(database).run();
    return database;
  }

  getDatabase(databaseId: string) {
    const database = this.requireActiveDatabase(databaseId);
    const fields = this.listActiveFields(database.id).map((field) => this.toFieldOutput(field));
    const records = this.persistence.db
      .select()
      .from(schema.records)
      .where(and(eq(schema.records.databaseId, database.id), isNull(schema.records.archivedAt)))
      .orderBy(asc(schema.records.sortOrder), asc(schema.records.sequenceNumber))
      .all()
      .map((record) => ({
        ...record,
        values: parseJsonObject(record.valuesJson)
      }));

    return { database, fields, records };
  }

  createField(databaseId: string, input: unknown) {
    const command = createFieldInputSchema.parse(input);
    const database = this.requireActiveDatabase(databaseId);
    const now = new Date();
    const config = parseFieldConfig(command.type, command.config);
    const field = {
      id: randomUUID(),
      databaseId: database.id,
      name: command.name,
      type: command.type,
      description: normalizeNullable(command.description),
      sortOrder: this.nextFieldSortOrder(database.id),
      configVersion: config.version,
      configJson: JSON.stringify(config),
      createdAt: now,
      updatedAt: now
    };

    this.persistence.db.insert(schema.fields).values(field).run();
    return { ...field, config };
  }

  updateField(fieldId: string, input: unknown) {
    const command = updateFieldInputSchema.parse(input);
    const field = this.persistence.db
      .select()
      .from(schema.fields)
      .where(and(eq(schema.fields.id, fieldId), isNull(schema.fields.archivedAt)))
      .get();

    if (!field) {
      throw new ResourceNotFoundError('Field');
    }

    this.requireActiveDatabase(field.databaseId);
    const nextConfig =
      command.config === undefined
        ? parseFieldConfig(field.type, parseJsonObject(field.configJson))
        : parseFieldConfig(field.type, command.config);
    const nextValues: Partial<typeof schema.fields.$inferInsert> = {
      updatedAt: new Date(),
      configVersion: nextConfig.version,
      configJson: JSON.stringify(nextConfig)
    };

    if (command.name !== undefined) {
      nextValues.name = command.name;
    }
    if (command.description !== undefined) {
      nextValues.description = normalizeNullable(command.description);
    }

    this.persistence.db
      .update(schema.fields)
      .set(nextValues)
      .where(eq(schema.fields.id, field.id))
      .run();
    return this.toFieldOutput({ ...field, ...nextValues });
  }

  createRecord(databaseId: string, input: unknown) {
    const command = createRecordInputSchema.parse(input);
    const insertRecord = this.persistence.sqlite.transaction(() =>
      this.insertRecord(databaseId, command)
    );

    return insertRecord();
  }

  listViews(databaseId: string) {
    this.requireActiveDatabase(databaseId);
    return this.persistence.db
      .select()
      .from(schema.views)
      .where(and(eq(schema.views.databaseId, databaseId), isNull(schema.views.archivedAt)))
      .orderBy(asc(schema.views.sortOrder))
      .all()
      .map((view) => this.toViewOutput(view));
  }

  createView(databaseId: string, input: unknown) {
    const command = createViewInputSchema.parse(input);
    this.requireActiveDatabase(databaseId);
    const config = parseViewConfig(
      command.config,
      this.listActiveFields(databaseId).map((field) => this.toValidationField(field))
    );
    const now = new Date();
    const view = {
      id: randomUUID(),
      databaseId,
      name: command.name,
      sortOrder: this.nextSortOrder('views', 'database_id', databaseId),
      configVersion: config.version,
      configJson: JSON.stringify(config),
      createdAt: now,
      updatedAt: now
    };
    this.persistence.db.insert(schema.views).values(view).run();
    return { ...view, config };
  }

  getView(viewId: string) {
    const view = this.requireActiveView(viewId);
    const database = this.requireActiveDatabase(view.databaseId);
    const rawFields = this.listActiveFields(database.id);
    const validationFields = rawFields.map((field) => this.toValidationField(field));
    const fields = rawFields.map((field) => this.toFieldOutput(field));
    const config = parseViewConfig(parseJsonObject(view.configJson), validationFields);
    const rows = this.persistence.db
      .select()
      .from(schema.records)
      .where(
        config.includeArchived
          ? eq(schema.records.databaseId, database.id)
          : and(eq(schema.records.databaseId, database.id), isNull(schema.records.archivedAt))
      )
      .all()
      .map((record) => ({
        ...record,
        values: parseJsonObject(record.valuesJson) as Record<
          string,
          string | number | boolean | string[]
        >
      }));
    return {
      view: { ...view, config },
      database,
      fields,
      records: evaluateViewRecords(rows, config, validationFields)
    };
  }

  updateView(viewId: string, input: unknown) {
    const command = updateViewInputSchema.parse(input);
    const view = this.requireActiveView(viewId);
    const fields = this.listActiveFields(view.databaseId).map((field) =>
      this.toValidationField(field)
    );
    const config = parseViewConfig(command.config ?? parseJsonObject(view.configJson), fields);
    const updatedAt = new Date();
    this.persistence.db
      .update(schema.views)
      .set({
        name: command.name ?? view.name,
        configVersion: config.version,
        configJson: JSON.stringify(config),
        updatedAt
      })
      .where(eq(schema.views.id, view.id))
      .run();
    return { ...view, name: command.name ?? view.name, config, updatedAt };
  }

  updateRecord(recordId: string, input: unknown) {
    const command = createRecordInputSchema.parse(input);
    const record = this.persistence.db
      .select()
      .from(schema.records)
      .where(and(eq(schema.records.id, recordId), isNull(schema.records.archivedAt)))
      .get();

    if (!record) {
      throw new ResourceNotFoundError('Record');
    }

    const database = this.requireActiveDatabase(record.databaseId);
    const fields = this.listActiveFields(database.id).map((field) => this.toValidationField(field));
    const values = validateRecordValues(fields, command.values);
    const updatedAt = new Date();
    this.persistence.db
      .update(schema.records)
      .set({ valuesJson: JSON.stringify(values), updatedAt })
      .where(eq(schema.records.id, record.id))
      .run();

    return { ...record, values, updatedAt };
  }

  archiveDatabase(databaseId: string) {
    const database = this.requireActiveDatabase(databaseId);
    return this.setArchived(schema.databases, database.id, true);
  }

  restoreDatabase(databaseId: string) {
    const database = this.persistence.db
      .select()
      .from(schema.databases)
      .where(eq(schema.databases.id, databaseId))
      .get();
    if (!database) throw new ResourceNotFoundError('Database');
    return this.setArchived(schema.databases, database.id, false);
  }

  archiveField(fieldId: string) {
    const field = this.requireActiveField(fieldId);
    return this.setArchived(schema.fields, field.id, true);
  }

  restoreField(fieldId: string) {
    const field = this.requireField(fieldId);
    this.requireActiveDatabase(field.databaseId);
    return this.setArchived(schema.fields, field.id, false);
  }

  archiveRecord(recordId: string) {
    const record = this.requireActiveRecord(recordId);
    return this.setArchived(schema.records, record.id, true);
  }

  restoreRecord(recordId: string) {
    const record = this.requireRecord(recordId);
    this.requireActiveDatabase(record.databaseId);
    return this.setArchived(schema.records, record.id, false);
  }

  archiveView(viewId: string) {
    const view = this.requireActiveView(viewId);
    return this.setArchived(schema.views, view.id, true);
  }

  restoreView(viewId: string) {
    const view = this.persistence.db
      .select()
      .from(schema.views)
      .where(eq(schema.views.id, viewId))
      .get();
    if (!view) throw new ResourceNotFoundError('View');
    this.requireActiveDatabase(view.databaseId);
    return this.setArchived(schema.views, view.id, false);
  }

  private insertRecord(databaseId: string, command: CreateRecordInput) {
    const database = this.requireActiveDatabase(databaseId);
    const fields = this.listActiveFields(database.id).map((field) => this.toValidationField(field));
    const values = validateRecordValues(fields, command.values);
    const now = new Date();
    const record = {
      id: randomUUID(),
      databaseId: database.id,
      sequenceNumber: database.nextSequence,
      sortOrder: this.nextRecordSortOrder(database.id),
      valuesJson: JSON.stringify(values),
      createdAt: now,
      updatedAt: now
    };

    this.persistence.db
      .update(schema.databases)
      .set({ nextSequence: database.nextSequence + 1, updatedAt: now })
      .where(eq(schema.databases.id, database.id))
      .run();
    this.persistence.db.insert(schema.records).values(record).run();

    return { ...record, values };
  }

  private ensureDefaultWorkspace() {
    const run = this.persistence.sqlite.transaction(() => {
      const setting = this.persistence.db
        .select()
        .from(schema.appSettings)
        .where(eq(schema.appSettings.key, defaultWorkspaceSettingKey))
        .get();
      const workspaceId = setting ? parseJsonObject(setting.valueJson).workspaceId : undefined;

      if (typeof workspaceId === 'string') {
        const workspace = this.persistence.db
          .select()
          .from(schema.workspaces)
          .where(eq(schema.workspaces.id, workspaceId))
          .get();
        if (workspace) {
          return workspace;
        }
      }

      const now = new Date();
      const workspace = {
        id: randomUUID(),
        name: defaultWorkspaceName,
        createdAt: now,
        updatedAt: now
      };
      this.persistence.db.insert(schema.workspaces).values(workspace).run();
      this.persistence.db
        .insert(schema.appSettings)
        .values({
          key: defaultWorkspaceSettingKey,
          configVersion: 1,
          valueJson: JSON.stringify({ workspaceId: workspace.id }),
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: schema.appSettings.key,
          set: { valueJson: JSON.stringify({ workspaceId: workspace.id }), updatedAt: now }
        })
        .run();
      return workspace;
    });

    return run();
  }

  private requireActiveDatabase(databaseId: string) {
    const workspace = this.ensureDefaultWorkspace();
    const database = this.persistence.db
      .select()
      .from(schema.databases)
      .where(
        and(
          eq(schema.databases.id, databaseId),
          eq(schema.databases.workspaceId, workspace.id),
          isNull(schema.databases.archivedAt)
        )
      )
      .get();

    if (!database) {
      throw new ResourceNotFoundError('Database');
    }
    return database;
  }

  private requireActiveDashboard(dashboardId: string) {
    const workspace = this.ensureDefaultWorkspace();
    const dashboard = this.persistence.db
      .select()
      .from(schema.dashboards)
      .where(
        and(
          eq(schema.dashboards.id, dashboardId),
          eq(schema.dashboards.workspaceId, workspace.id),
          isNull(schema.dashboards.archivedAt)
        )
      )
      .get();
    if (!dashboard) throw new ResourceNotFoundError('Dashboard');
    return dashboard;
  }

  private requireDashboardBlock(blockId: string) {
    const block = this.persistence.db
      .select()
      .from(schema.dashboardBlocks)
      .where(eq(schema.dashboardBlocks.id, blockId))
      .get();
    if (!block) throw new ResourceNotFoundError('Dashboard block');
    return block;
  }

  private requireField(fieldId: string) {
    const field = this.persistence.db
      .select()
      .from(schema.fields)
      .where(eq(schema.fields.id, fieldId))
      .get();
    if (!field) throw new ResourceNotFoundError('Field');
    return field;
  }

  private requireActiveField(fieldId: string) {
    const field = this.requireField(fieldId);
    if (field.archivedAt) throw new ResourceNotFoundError('Field');
    this.requireActiveDatabase(field.databaseId);
    return field;
  }

  private requireRecord(recordId: string) {
    const record = this.persistence.db
      .select()
      .from(schema.records)
      .where(eq(schema.records.id, recordId))
      .get();
    if (!record) throw new ResourceNotFoundError('Record');
    return record;
  }

  private requireActiveRecord(recordId: string) {
    const record = this.requireRecord(recordId);
    if (record.archivedAt) throw new ResourceNotFoundError('Record');
    this.requireActiveDatabase(record.databaseId);
    return record;
  }

  private requireActiveView(viewId: string) {
    const view = this.persistence.db
      .select()
      .from(schema.views)
      .where(and(eq(schema.views.id, viewId), isNull(schema.views.archivedAt)))
      .get();
    if (!view) throw new ResourceNotFoundError('View');
    return view;
  }

  private setArchived(
    table:
      typeof schema.databases | typeof schema.fields | typeof schema.records | typeof schema.views,
    id: string,
    archived: boolean
  ) {
    const updatedAt = new Date();
    this.persistence.db
      .update(table)
      .set({ archivedAt: archived ? updatedAt : null, updatedAt })
      .where(eq(table.id, id))
      .run();
    return this.persistence.db.select().from(table).where(eq(table.id, id)).get();
  }

  private listActiveFields(databaseId: string) {
    return this.persistence.db
      .select()
      .from(schema.fields)
      .where(and(eq(schema.fields.databaseId, databaseId), isNull(schema.fields.archivedAt)))
      .orderBy(asc(schema.fields.sortOrder), asc(schema.fields.createdAt))
      .all();
  }

  private nextDatabaseSortOrder(workspaceId: string) {
    return this.nextSortOrder('databases', 'workspace_id', workspaceId);
  }

  private nextFieldSortOrder(databaseId: string) {
    return this.nextSortOrder('fields', 'database_id', databaseId);
  }

  private nextRecordSortOrder(databaseId: string) {
    return this.nextSortOrder('records', 'database_id', databaseId);
  }

  private nextSortOrder(
    table: 'databases' | 'fields' | 'records' | 'views' | 'dashboards' | 'dashboard_blocks',
    column: string,
    value: string
  ) {
    const row = this.persistence.sqlite
      .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS sortOrder FROM ${table} WHERE ${column} = ?`)
      .get(value) as { sortOrder: number };
    return row.sortOrder + sortOrderStep;
  }

  private toValidationField(
    field: typeof schema.fields.$inferSelect
  ): FieldDefinitionForValidation {
    return {
      id: field.id,
      type: field.type,
      config: parseFieldConfig(field.type, parseJsonObject(field.configJson))
    };
  }

  private toFieldOutput(field: typeof schema.fields.$inferSelect) {
    return {
      ...field,
      config: parseFieldConfig(field.type, parseJsonObject(field.configJson))
    };
  }

  private toViewOutput(view: typeof schema.views.$inferSelect) {
    return {
      ...view,
      config: parseViewConfig(
        parseJsonObject(view.configJson),
        this.listActiveFields(view.databaseId).map((field) => this.toValidationField(field))
      )
    };
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object in local persistence.');
  }
  return parsed as Record<string, unknown>;
}

function normalizeNullable(value: string | null | undefined): string | null | undefined {
  return value === '' ? null : value;
}
