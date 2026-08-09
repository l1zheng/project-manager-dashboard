import { z } from 'zod';

const identifierSchema = z.string().trim().min(1).max(120);
const titleSchema = z.string().trim().max(120);
const optionalTitleSchema = titleSchema.nullable().default(null);
const optionalDescriptionSchema = z.string().trim().max(2_000).nullable().default(null);

export const dashboardBlockKindSchema = z.enum(['table_view', 'text', 'image']);
export type DashboardBlockKind = z.infer<typeof dashboardBlockKindSchema>;

export const tableViewBlockConfigSchema = z
  .object({
    version: z.literal(1),
    titleOverride: optionalTitleSchema,
    description: optionalDescriptionSchema
  })
  .strict();

export const textBlockConfigSchema = z
  .object({
    version: z.literal(1),
    title: titleSchema,
    body: z.string().max(20_000)
  })
  .strict();

export const imageBlockConfigSchema = z
  .object({
    version: z.literal(1),
    title: optionalTitleSchema,
    caption: optionalDescriptionSchema
  })
  .strict();

export type TableViewBlockConfig = z.infer<typeof tableViewBlockConfigSchema>;
export type TextBlockConfig = z.infer<typeof textBlockConfigSchema>;
export type ImageBlockConfig = z.infer<typeof imageBlockConfigSchema>;
export type DashboardBlockConfig = TableViewBlockConfig | TextBlockConfig | ImageBlockConfig;

const newDashboardBlockInputSchema = z
  .object({
    kind: dashboardBlockKindSchema,
    viewId: identifierSchema.nullable().optional(),
    mediaAssetId: identifierSchema.nullable().optional(),
    config: z.unknown(),
    isCollapsed: z.boolean().optional(),
    includeInExport: z.boolean().optional()
  })
  .strict();

const legacyTableBlockInputSchema = z
  .object({
    viewId: identifierSchema,
    titleOverride: z.string().trim().max(120).nullable().optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    isCollapsed: z.boolean().optional(),
    includeInExport: z.boolean().optional()
  })
  .strict();

export const createDashboardBlockInputSchema = z
  .union([newDashboardBlockInputSchema, legacyTableBlockInputSchema])
  .transform((input) => {
    if (!('kind' in input)) {
      return {
        kind: 'table_view' as const,
        viewId: input.viewId,
        mediaAssetId: null,
        config: tableViewBlockConfigSchema.parse({
          version: 1,
          titleOverride: input.titleOverride ?? null,
          description: input.description ?? null
        }),
        isCollapsed: input.isCollapsed,
        includeInExport: input.includeInExport
      };
    }

    const config = parseDashboardBlockConfig(input.kind, input.config);
    const viewId = input.viewId ?? null;
    const mediaAssetId = input.mediaAssetId ?? null;
    if (input.kind === 'table_view' && (!viewId || mediaAssetId)) {
      throw blockReferenceError('Table modules require one view and cannot reference an image.');
    }
    if (input.kind === 'text' && (viewId || mediaAssetId)) {
      throw blockReferenceError('Text modules cannot reference a view or image asset.');
    }
    if (input.kind === 'image' && viewId) {
      throw blockReferenceError('Image modules cannot reference a database view.');
    }
    return {
      ...input,
      viewId,
      mediaAssetId,
      config
    };
  });

export const updateDashboardBlockInputSchema = z
  .object({
    config: z.unknown().optional(),
    isCollapsed: z.boolean().optional(),
    includeInExport: z.boolean().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    titleOverride: z.string().trim().max(120).nullable().optional(),
    description: z.string().trim().max(2_000).nullable().optional()
  })
  .strict()
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'At least one dashboard block property must be supplied.'
  });

export const reorderDashboardBlocksInputSchema = z
  .object({
    blockIds: z.array(identifierSchema).max(200)
  })
  .strict()
  .refine((input) => new Set(input.blockIds).size === input.blockIds.length, {
    message: 'Dashboard block IDs must be unique.'
  });

export function parseDashboardBlockConfig(kind: 'table_view', input: unknown): TableViewBlockConfig;
export function parseDashboardBlockConfig(kind: 'text', input: unknown): TextBlockConfig;
export function parseDashboardBlockConfig(kind: 'image', input: unknown): ImageBlockConfig;
export function parseDashboardBlockConfig(
  kind: DashboardBlockKind,
  input: unknown
): DashboardBlockConfig;
export function parseDashboardBlockConfig(
  kind: DashboardBlockKind,
  input: unknown
): DashboardBlockConfig {
  switch (kind) {
    case 'table_view':
      return tableViewBlockConfigSchema.parse(input);
    case 'text':
      return textBlockConfigSchema.parse(input);
    case 'image':
      return imageBlockConfigSchema.parse(input);
  }
}

function blockReferenceError(message: string): z.ZodError {
  return new z.ZodError([{ code: 'custom', path: [], message }]);
}
