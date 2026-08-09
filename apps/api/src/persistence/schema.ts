import type { FieldType } from '@project-manager/domain';
import type { DashboardBlockKind } from '@project-manager/domain';
import { sql } from 'drizzle-orm';
import {
  blob,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core';

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

export const mediaAssets = sqliteTable(
  'media_assets',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    mimeType: text('mime_type').notNull(),
    byteLength: integer('byte_length').notNull(),
    sha256: text('sha256').notNull(),
    originalFilename: text('original_filename'),
    content: blob('content', { mode: 'buffer' }).notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [
    index('media_assets_workspace_archive_idx').on(table.workspaceId, table.archivedAt),
    index('media_assets_workspace_digest_idx').on(table.workspaceId, table.sha256)
  ]
);

export const dashboardBlocks = sqliteTable(
  'dashboard_blocks',
  {
    id: text('id').primaryKey(),
    dashboardId: text('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'restrict' }),
    kind: text('kind').$type<DashboardBlockKind>().notNull().default('table_view'),
    viewId: text('view_id').references(() => views.id, { onDelete: 'restrict' }),
    mediaAssetId: text('media_asset_id').references(() => mediaAssets.id, {
      onDelete: 'restrict'
    }),
    configVersion: integer('config_version').notNull().default(1),
    configJson: text('config_json').notNull().default(emptyObject),
    sortOrder: integer('sort_order').notNull().default(0),
    isCollapsed: integer('is_collapsed', { mode: 'boolean' }).notNull().default(false),
    includeInExport: integer('include_in_export', { mode: 'boolean' }).notNull().default(true),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [
    index('dashboard_blocks_dashboard_order_idx').on(table.dashboardId, table.sortOrder),
    index('dashboard_blocks_view_idx').on(table.viewId),
    index('dashboard_blocks_media_asset_idx').on(table.mediaAssetId),
    check(
      'dashboard_blocks_reference_shape_check',
      sql`(${table.kind} = 'table_view' AND ${table.viewId} IS NOT NULL AND ${table.mediaAssetId} IS NULL) OR (${table.kind} = 'text' AND ${table.viewId} IS NULL AND ${table.mediaAssetId} IS NULL) OR (${table.kind} = 'image' AND ${table.viewId} IS NULL)`
    )
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
