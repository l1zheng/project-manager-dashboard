import type { FieldType } from '@project-manager/domain';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const emptyObject = '{}';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

export const databases = sqliteTable(
  'databases',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    nextSequence: integer('next_sequence').notNull().default(1),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [index('databases_workspace_order_idx').on(table.workspaceId, table.sortOrder)]
);

export const fields = sqliteTable(
  'fields',
  {
    id: text('id').primaryKey(),
    databaseId: text('database_id')
      .notNull()
      .references(() => databases.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    type: text('type').$type<FieldType>().notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    configVersion: integer('config_version').notNull().default(1),
    configJson: text('config_json').notNull().default(emptyObject),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [
    index('fields_database_archive_order_idx').on(
      table.databaseId,
      table.archivedAt,
      table.sortOrder
    )
  ]
);

export const records = sqliteTable(
  'records',
  {
    id: text('id').primaryKey(),
    databaseId: text('database_id')
      .notNull()
      .references(() => databases.id, { onDelete: 'restrict' }),
    sequenceNumber: integer('sequence_number').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    valuesVersion: integer('values_version').notNull().default(1),
    valuesJson: text('values_json').notNull().default(emptyObject),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [
    uniqueIndex('records_database_sequence_unique').on(table.databaseId, table.sequenceNumber),
    index('records_database_archive_order_idx').on(
      table.databaseId,
      table.archivedAt,
      table.sortOrder
    )
  ]
);

export const views = sqliteTable(
  'views',
  {
    id: text('id').primaryKey(),
    databaseId: text('database_id')
      .notNull()
      .references(() => databases.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    type: text('type').notNull().default('table'),
    sortOrder: integer('sort_order').notNull().default(0),
    configVersion: integer('config_version').notNull().default(1),
    configJson: text('config_json').notNull().default(emptyObject),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [
    index('views_database_archive_order_idx').on(
      table.databaseId,
      table.archivedAt,
      table.sortOrder
    )
  ]
);

export const dashboards = sqliteTable(
  'dashboards',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [
    index('dashboards_workspace_archive_order_idx').on(
      table.workspaceId,
      table.archivedAt,
      table.sortOrder
    )
  ]
);

export const dashboardBlocks = sqliteTable(
  'dashboard_blocks',
  {
    id: text('id').primaryKey(),
    dashboardId: text('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'restrict' }),
    viewId: text('view_id')
      .notNull()
      .references(() => views.id, { onDelete: 'restrict' }),
    titleOverride: text('title_override'),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    isCollapsed: integer('is_collapsed', { mode: 'boolean' }).notNull().default(false),
    includeInExport: integer('include_in_export', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [
    index('dashboard_blocks_dashboard_order_idx').on(table.dashboardId, table.sortOrder),
    index('dashboard_blocks_view_idx').on(table.viewId)
  ]
);

export const reportTemplates = sqliteTable(
  'report_templates',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    configVersion: integer('config_version').notNull().default(1),
    optionsJson: text('options_json').notNull().default(emptyObject),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [
    index('report_templates_workspace_archive_idx').on(table.workspaceId, table.archivedAt)
  ]
);

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  configVersion: integer('config_version').notNull().default(1),
  valueJson: text('value_json').notNull().default(emptyObject),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});
