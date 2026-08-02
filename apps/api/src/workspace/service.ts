import { randomUUID } from 'node:crypto';
import {
  createDatabaseInputSchema,
  createFieldInputSchema,
  createRecordInputSchema,
  parseFieldConfig,
  updateFieldInputSchema,
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

  private setArchived(
    table: typeof schema.databases | typeof schema.fields | typeof schema.records,
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

  private nextSortOrder(table: 'databases' | 'fields' | 'records', column: string, value: string) {
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
