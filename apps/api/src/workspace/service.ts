import { randomUUID } from 'node:crypto';
import {
  createDatabaseInputSchema,
  createDashboardBlockInputSchema,
  createDashboardInputSchema,
  createFieldInputSchema,
  createRecordInputSchema,
  createViewInputSchema,
  evaluateViewRecords,
  parseDashboardBlockConfig,
  parseFieldConfig,
  parseViewConfig,
  reorderDashboardBlocksInputSchema,
  updateFieldInputSchema,
  updateDatabaseInputSchema,
  updateDashboardBlockInputSchema,
  updateDashboardInputSchema,
  updateViewInputSchema,
  validateRecordValues,
  type CreateRecordInput,
  type DashboardBlockConfig,
  type FieldDefinitionForValidation,
  type FilterExpression
} from '@project-manager/domain';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { ZodError } from 'zod';
import type { Persistence } from '../persistence/database.js';
import * as schema from '../persistence/schema.js';
import { validateImageAsset } from './media.js';

const defaultWorkspaceSettingKey = 'default_workspace_id';
const defaultWorkspaceName = '我的项目管理';
const sortOrderStep = 1_000;

export class ResourceNotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} was not found.`);
    this.name = 'ResourceNotFoundError';
  }
}

export class FieldValuesRequireClearError extends Error {
  constructor() {
    super('修改该列属性会使现有值失效。请确认清空这一列后再继续。');
    this.name = 'FieldValuesRequireClearError';
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
      .where(
        and(
          eq(schema.dashboardBlocks.dashboardId, dashboard.id),
          isNull(schema.dashboardBlocks.archivedAt)
        )
      )
      .orderBy(asc(schema.dashboardBlocks.sortOrder))
      .all()
      .map((block) => this.toDashboardBlockOutput(block));
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
    if (command.viewId) {
      const view = this.requireActiveView(command.viewId);
      const database = this.requireActiveDatabase(view.databaseId);
      if (database.workspaceId !== dashboard.workspaceId) {
        throw new ResourceNotFoundError('View');
      }
    }
    if (command.mediaAssetId) {
      this.requireActiveMediaAsset(command.mediaAssetId, dashboard.workspaceId);
    }
    const now = new Date();
    const block = {
      id: randomUUID(),
      dashboardId: dashboard.id,
      kind: command.kind,
      viewId: command.viewId,
      mediaAssetId: command.mediaAssetId,
      configVersion: command.config.version,
      configJson: JSON.stringify(command.config),
      sortOrder: this.nextSortOrder('dashboard_blocks', 'dashboard_id', dashboard.id),
      isCollapsed: command.isCollapsed ?? false,
      includeInExport: command.includeInExport ?? true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now
    };
    this.persistence.db.insert(schema.dashboardBlocks).values(block).run();
    return this.toDashboardBlockOutput(block);
  }

  updateDashboardBlock(blockId: string, input: unknown) {
    const command = updateDashboardBlockInputSchema.parse(input);
    const block = this.requireDashboardBlock(blockId);
    this.requireActiveDashboard(block.dashboardId);
    const updatedAt = new Date();
    const currentConfig = parseDashboardBlockConfig(block.kind, parseJsonObject(block.configJson));
    let nextConfig: DashboardBlockConfig =
      command.config === undefined
        ? currentConfig
        : parseDashboardBlockConfig(block.kind, command.config);
    if (block.kind === 'table_view') {
      const tableConfig = parseDashboardBlockConfig('table_view', nextConfig);
      nextConfig = {
        ...tableConfig,
        titleOverride:
          command.titleOverride === undefined
            ? tableConfig.titleOverride
            : (normalizeNullable(command.titleOverride) ?? null),
        description:
          command.description === undefined
            ? tableConfig.description
            : (normalizeNullable(command.description) ?? null)
      };
    } else if (command.titleOverride !== undefined || command.description !== undefined) {
      throw new ZodError([
        {
          code: 'custom',
          path: [],
          message: 'Legacy title and description updates apply only to table modules.'
        }
      ]);
    }
    const next = {
      configVersion: nextConfig.version,
      configJson: JSON.stringify(nextConfig),
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
    return this.toDashboardBlockOutput({ ...block, ...next });
  }

  replaceImageBlockAsset(
    blockId: string,
    input: { content: Buffer; mimeType: string; originalFilename?: string | null }
  ) {
    const block = this.requireDashboardBlock(blockId);
    if (block.kind !== 'image') throw new ResourceNotFoundError('Image module');
    const dashboard = this.requireActiveDashboard(block.dashboardId);
    const validated = validateImageAsset(input);
    const replace = this.persistence.sqlite.transaction(() => {
      const now = new Date();
      const asset = {
        id: randomUUID(),
        workspaceId: dashboard.workspaceId,
        mimeType: validated.mimeType,
        byteLength: validated.byteLength,
        sha256: validated.sha256,
        originalFilename: validated.originalFilename,
        content: validated.content,
        archivedAt: null,
        createdAt: now,
        updatedAt: now
      };
      this.persistence.db.insert(schema.mediaAssets).values(asset).run();
      this.persistence.db
        .update(schema.dashboardBlocks)
        .set({ mediaAssetId: asset.id, updatedAt: now })
        .where(eq(schema.dashboardBlocks.id, block.id))
        .run();
      if (block.mediaAssetId) {
        const anotherReference = this.persistence.db
          .select({ id: schema.dashboardBlocks.id })
          .from(schema.dashboardBlocks)
          .where(
            and(
              eq(schema.dashboardBlocks.mediaAssetId, block.mediaAssetId),
              isNull(schema.dashboardBlocks.archivedAt)
            )
          )
          .get();
        if (!anotherReference) {
          this.persistence.db
            .update(schema.mediaAssets)
            .set({ archivedAt: now, updatedAt: now })
            .where(eq(schema.mediaAssets.id, block.mediaAssetId))
            .run();
        }
      }
      return this.toDashboardBlockOutput({ ...block, mediaAssetId: asset.id, updatedAt: now });
    });
    return replace();
  }

  getMediaAssetContent(mediaAssetId: string) {
    const workspace = this.ensureDefaultWorkspace();
    const asset = this.requireActiveMediaAsset(mediaAssetId, workspace.id);
    return {
      content: asset.content,
      mimeType: asset.mimeType,
      byteLength: asset.byteLength
    };
  }

  reorderDashboardBlocks(dashboardId: string, input: unknown) {
    const command = reorderDashboardBlocksInputSchema.parse(input);
    const dashboard = this.requireActiveDashboard(dashboardId);
    const activeBlocks = this.persistence.db
      .select({ id: schema.dashboardBlocks.id })
      .from(schema.dashboardBlocks)
      .where(
        and(
          eq(schema.dashboardBlocks.dashboardId, dashboard.id),
          isNull(schema.dashboardBlocks.archivedAt)
        )
      )
      .all();
    const activeIds = new Set(activeBlocks.map((block) => block.id));
    if (
      command.blockIds.length !== activeIds.size ||
      command.blockIds.some((blockId) => !activeIds.has(blockId))
    ) {
      throw new ZodError([
        {
          code: 'custom',
          path: ['blockIds'],
          message: 'Block order must contain every active dashboard module exactly once.'
        }
      ]);
    }
    const reorder = this.persistence.sqlite.transaction(() => {
      const updatedAt = new Date();
      for (const [index, blockId] of command.blockIds.entries()) {
        this.persistence.db
          .update(schema.dashboardBlocks)
          .set({ sortOrder: (index + 1) * sortOrderStep, updatedAt })
          .where(eq(schema.dashboardBlocks.id, blockId))
          .run();
      }
      return this.getDashboard(dashboard.id);
    });
    return reorder();
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

  updateDatabase(databaseId: string, input: unknown) {
    const command = updateDatabaseInputSchema.parse(input);
    const database = this.requireActiveDatabase(databaseId);
    const next = {
      name: command.name ?? database.name,
      description:
        command.description === undefined
          ? database.description
          : normalizeNullable(command.description),
      color: command.color === undefined ? database.color : normalizeNullable(command.color),
      updatedAt: new Date()
    };
    this.persistence.db
      .update(schema.databases)
      .set(next)
      .where(eq(schema.databases.id, database.id))
      .run();
    return { ...database, ...next };
  }

  ensurePrimaryDashboard() {
    const ensure = this.persistence.sqlite.transaction(() => {
      const databases = this.listDatabases();
      const dashboard = this.listDashboards()[0] ?? this.createDashboard({ name: '项目工作台' });
      let detail = this.getDashboard(dashboard.id);
      const representedDatabaseIds = new Set(
        detail.blocks.flatMap((block) =>
          block.kind === 'table_view' ? [block.view.database.id] : []
        )
      );

      for (const database of databases) {
        if (representedDatabaseIds.has(database.id)) continue;
        const existingView = this.listViews(database.id)[0];
        let viewId = existingView?.id;
        if (!viewId) {
          const fields = this.getDatabase(database.id).fields;
          viewId = this.createView(database.id, {
            name: '表格',
            config: {
              version: 1,
              visibleFieldIds: fields.map((field) => field.id),
              filter: null,
              sorts: [],
              fieldWidths: {},
              includeArchived: false
            }
          }).id;
        }
        this.createDashboardBlock(dashboard.id, { viewId });
        representedDatabaseIds.add(database.id);
      }

      detail = this.getDashboard(dashboard.id);
      return detail;
    });

    return ensure();
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
    this.assertSingleCompletionField(database.id, undefined, config);
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
    const currentConfig = parseFieldConfig(field.type, parseJsonObject(field.configJson));
    const nextType = command.type ?? field.type;
    const nextConfig =
      command.config === undefined
        ? parseFieldConfig(nextType, nextType === field.type ? currentConfig : { version: 1 })
        : parseFieldConfig(nextType, command.config);
    this.assertSingleCompletionField(field.databaseId, field.id, nextConfig);
    const records = this.persistence.db
      .select()
      .from(schema.records)
      .where(eq(schema.records.databaseId, field.databaseId))
      .all();
    const invalidRecordIds = records.flatMap((record) => {
      const values = parseJsonObject(record.valuesJson);
      if (!(field.id in values)) return [];
      try {
        validateRecordValues([{ id: field.id, type: nextType, config: nextConfig }], {
          [field.id]: values[field.id]
        });
        return [];
      } catch {
        return [record.id];
      }
    });
    if (invalidRecordIds.length > 0 && command.clearValues !== true) {
      throw new FieldValuesRequireClearError();
    }

    const update = this.persistence.sqlite.transaction(() => {
      const updatedAt = new Date();
      if (invalidRecordIds.length > 0) {
        for (const record of records) {
          if (!invalidRecordIds.includes(record.id)) continue;
          const values = parseJsonObject(record.valuesJson);
          delete values[field.id];
          this.persistence.db
            .update(schema.records)
            .set({ valuesJson: JSON.stringify(values), updatedAt })
            .where(eq(schema.records.id, record.id))
            .run();
        }
      }

      const nextValues: Partial<typeof schema.fields.$inferInsert> = {
        type: nextType,
        updatedAt,
        configVersion: nextConfig.version,
        configJson: JSON.stringify(nextConfig)
      };
      if (command.name !== undefined) nextValues.name = command.name;
      if (command.description !== undefined) {
        nextValues.description = normalizeNullable(command.description);
      }
      this.persistence.db
        .update(schema.fields)
        .set(nextValues)
        .where(eq(schema.fields.id, field.id))
        .run();

      if (command.type !== undefined || command.config !== undefined) {
        const validationFields = this.listActiveFields(field.databaseId).map((item) =>
          item.id === field.id
            ? { id: field.id, type: nextType, config: nextConfig }
            : this.toValidationField(item)
        );
        const views = this.persistence.db
          .select()
          .from(schema.views)
          .where(eq(schema.views.databaseId, field.databaseId))
          .all();
        for (const view of views) {
          const rawConfig = parseJsonObject(view.configJson);
          let config;
          try {
            config = parseViewConfig(rawConfig, validationFields);
          } catch {
            config = parseViewConfig(
              {
                ...rawConfig,
                filter: removeFieldFromFilter(rawConfig.filter, field.id)
              },
              validationFields
            );
          }
          this.persistence.db
            .update(schema.views)
            .set({
              configVersion: config.version,
              configJson: JSON.stringify(config),
              updatedAt
            })
            .where(eq(schema.views.id, view.id))
            .run();
        }
      }

      return this.toFieldOutput({ ...field, ...nextValues });
    });
    return update();
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
    this.assertSingleCompletionField(
      field.databaseId,
      field.id,
      parseFieldConfig(field.type, parseJsonObject(field.configJson))
    );
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
      .where(and(eq(schema.dashboardBlocks.id, blockId), isNull(schema.dashboardBlocks.archivedAt)))
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

  private requireActiveMediaAsset(mediaAssetId: string, workspaceId: string) {
    const asset = this.persistence.db
      .select()
      .from(schema.mediaAssets)
      .where(
        and(
          eq(schema.mediaAssets.id, mediaAssetId),
          eq(schema.mediaAssets.workspaceId, workspaceId),
          isNull(schema.mediaAssets.archivedAt)
        )
      )
      .get();
    if (!asset) throw new ResourceNotFoundError('Media asset');
    return asset;
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

  private assertSingleCompletionField(
    databaseId: string,
    currentFieldId: string | undefined,
    config: FieldDefinitionForValidation['config']
  ): void {
    if (!config.completion) return;
    const anotherCompletionField = this.listActiveFields(databaseId).find((field) => {
      if (field.id === currentFieldId) return false;
      return (
        parseFieldConfig(field.type, parseJsonObject(field.configJson)).completion !== undefined
      );
    });
    if (!anotherCompletionField) return;

    throw new ZodError([
      {
        code: 'custom',
        path: ['config', 'completion'],
        message: 'A database can have only one status field used for completion tracking.'
      }
    ]);
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

  private toDashboardBlockOutput(block: typeof schema.dashboardBlocks.$inferSelect) {
    const config = parseDashboardBlockConfig(block.kind, parseJsonObject(block.configJson));
    if (block.kind === 'table_view') {
      if (!block.viewId) throw new Error('A persisted table module is missing its view reference.');
      const tableConfig = parseDashboardBlockConfig('table_view', config);
      return {
        ...block,
        kind: 'table_view' as const,
        config: tableConfig,
        titleOverride: tableConfig.titleOverride,
        description: tableConfig.description,
        view: this.getView(block.viewId)
      };
    }
    if (block.kind === 'text') {
      return {
        ...block,
        kind: 'text' as const,
        config: parseDashboardBlockConfig('text', config)
      };
    }
    const asset = block.mediaAssetId
      ? this.requireActiveMediaAsset(
          block.mediaAssetId,
          this.requireActiveDashboard(block.dashboardId).workspaceId
        )
      : null;
    return {
      ...block,
      kind: 'image' as const,
      config: parseDashboardBlockConfig('image', config),
      asset: asset
        ? {
            id: asset.id,
            mimeType: asset.mimeType,
            byteLength: asset.byteLength,
            originalFilename: asset.originalFilename,
            contentUrl: `/api/media-assets/${asset.id}/content`
          }
        : null
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

function removeFieldFromFilter(input: unknown, fieldId: string): FilterExpression | null {
  if (!input || typeof input !== 'object') return null;
  const node = input as FilterExpression;
  if (node.kind === 'condition') return node.fieldId === fieldId ? null : node;
  if (node.kind !== 'group') return null;
  const children = node.children
    .map((child) => removeFieldFromFilter(child, fieldId))
    .filter((child): child is FilterExpression => child !== null);
  return children.length === 0 ? null : { ...node, children };
}

function normalizeNullable(value: string | null | undefined): string | null | undefined {
  return value === '' ? null : value;
}
