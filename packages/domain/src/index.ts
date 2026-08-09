import { z } from 'zod';

export * from './filter.js';
export * from './view.js';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('project-manager-api'),
  timestamp: z.string().datetime(),
  storage: z
    .object({
      engine: z.literal('sqlite'),
      migration: z.object({
        appliedCount: z.number().int().nonnegative(),
        pendingCount: z.number().int().nonnegative(),
        totalCount: z.number().int().nonnegative()
      }),
      restorePending: z.boolean().optional(),
      restore: z
        .object({
          status: z.enum(['restored', 'rolled_back']),
          restoreId: z.string(),
          message: z.string().optional()
        })
        .optional()
    })
    .optional()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const fieldTypeSchema = z.enum([
  'short_text',
  'long_text',
  'number',
  'date',
  'single_select',
  'multi_select',
  'status',
  'person',
  'checkbox',
  'url',
  'sequence'
]);

export type FieldType = z.infer<typeof fieldTypeSchema>;

const identifierSchema = z.string().trim().min(1).max(120);
const displayNameSchema = z.string().trim().min(1).max(120);
const optionalDescriptionSchema = z.string().trim().max(2_000).nullable().optional();

export const selectOptionSchema = z.object({
  id: identifierSchema,
  label: displayNameSchema,
  color: z.string().trim().max(40).optional()
});

export const completionConfigSchema = z
  .object({
    completedOptionIds: z.array(identifierSchema).min(1).max(100)
  })
  .strict();

export const fieldConfigSchema = z
  .object({
    version: z.literal(1),
    options: z.array(selectOptionSchema).min(1).max(100).optional(),
    completion: completionConfigSchema.optional()
  })
  .strict();

export type FieldConfig = z.infer<typeof fieldConfigSchema>;

export const createDatabaseInputSchema = z.object({
  name: displayNameSchema,
  description: optionalDescriptionSchema,
  color: z.string().trim().max(40).nullable().optional()
});

export type CreateDatabaseInput = z.infer<typeof createDatabaseInputSchema>;

export const updateDatabaseInputSchema = z
  .object({
    name: displayNameSchema.optional(),
    description: optionalDescriptionSchema,
    color: z.string().trim().max(40).nullable().optional()
  })
  .refine(
    (input) =>
      input.name !== undefined || input.description !== undefined || input.color !== undefined,
    { message: 'At least one database property must be supplied.' }
  );

export type UpdateDatabaseInput = z.infer<typeof updateDatabaseInputSchema>;

export const createFieldInputSchema = z.object({
  name: displayNameSchema,
  type: fieldTypeSchema,
  description: optionalDescriptionSchema,
  config: z.unknown().optional()
});

export type CreateFieldInput = z.infer<typeof createFieldInputSchema>;

export const updateFieldInputSchema = z
  .object({
    name: displayNameSchema.optional(),
    type: fieldTypeSchema.optional(),
    description: optionalDescriptionSchema,
    config: z.unknown().optional(),
    clearValues: z.boolean().optional()
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.type !== undefined ||
      input.description !== undefined ||
      input.config !== undefined,
    {
      message: 'At least one field property must be supplied.'
    }
  );

export type UpdateFieldInput = z.infer<typeof updateFieldInputSchema>;

export const createRecordInputSchema = z.object({
  values: z.record(identifierSchema, z.unknown()).default({})
});

export type CreateRecordInput = z.infer<typeof createRecordInputSchema>;

export const createViewInputSchema = z.object({
  name: displayNameSchema,
  config: z.unknown()
});
export const updateViewInputSchema = z
  .object({
    name: displayNameSchema.optional(),
    config: z.unknown().optional()
  })
  .refine((input) => input.name !== undefined || input.config !== undefined, {
    message: 'At least one view property must be supplied.'
  });

export const createDashboardInputSchema = z.object({
  name: displayNameSchema,
  description: optionalDescriptionSchema
});
export const updateDashboardInputSchema = z
  .object({ name: displayNameSchema.optional(), description: optionalDescriptionSchema })
  .refine((input) => input.name !== undefined || input.description !== undefined, {
    message: 'At least one dashboard property must be supplied.'
  });
export const createDashboardBlockInputSchema = z.object({
  viewId: identifierSchema,
  titleOverride: optionalDescriptionSchema,
  description: optionalDescriptionSchema,
  isCollapsed: z.boolean().optional(),
  includeInExport: z.boolean().optional()
});
export const updateDashboardBlockInputSchema = z
  .object({
    titleOverride: optionalDescriptionSchema,
    description: optionalDescriptionSchema,
    isCollapsed: z.boolean().optional(),
    includeInExport: z.boolean().optional(),
    sortOrder: z.number().int().nonnegative().optional()
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'At least one dashboard block property must be supplied.'
  });

export const updateRecordInputSchema = createRecordInputSchema;

export type UpdateRecordInput = z.infer<typeof updateRecordInputSchema>;

export interface FieldDefinitionForValidation {
  id: string;
  type: FieldType;
  config: FieldConfig;
}

export function parseFieldConfig(type: FieldType, input: unknown): FieldConfig {
  const config = fieldConfigSchema.parse(input ?? { version: 1 });
  const supportsOptions = type === 'single_select' || type === 'multi_select' || type === 'status';

  if (supportsOptions && !config.options) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['config', 'options'],
        message: `${type} fields require at least one option.`
      }
    ]);
  }

  if (!supportsOptions && config.options) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['config', 'options'],
        message: `${type} fields do not support options.`
      }
    ]);
  }

  if (type !== 'status' && config.completion) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['config', 'completion'],
        message: `${type} fields do not support completion tracking.`
      }
    ]);
  }

  const optionIds = config.options?.map((option) => option.id) ?? [];
  if (new Set(optionIds).size !== optionIds.length) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['config', 'options'],
        message: 'Option IDs must be unique within a field.'
      }
    ]);
  }

  const completedOptionIds = config.completion?.completedOptionIds ?? [];
  if (new Set(completedOptionIds).size !== completedOptionIds.length) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['config', 'completion', 'completedOptionIds'],
        message: 'Completed option IDs must be unique within a field.'
      }
    ]);
  }
  if (completedOptionIds.some((optionId) => !optionIds.includes(optionId))) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['config', 'completion', 'completedOptionIds'],
        message: 'Completed option IDs must reference options in the same status field.'
      }
    ]);
  }

  return config;
}

export function isRecordCompleted(
  fields: FieldDefinitionForValidation[],
  values: Record<string, unknown>
): boolean {
  return fields.some((field) => {
    if (field.type !== 'status' || !field.config.completion) return false;
    const value = values[field.id];
    return typeof value === 'string' && field.config.completion.completedOptionIds.includes(value);
  });
}

export function validateRecordValues(
  fields: FieldDefinitionForValidation[],
  values: Record<string, unknown>
): Record<string, string | number | boolean | string[]> {
  const fieldsById = new Map(fields.map((field) => [field.id, field]));

  for (const fieldId of Object.keys(values)) {
    if (!fieldsById.has(fieldId)) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['values', fieldId],
          message: 'The supplied field does not exist or is archived.'
        }
      ]);
    }
  }

  const normalized: Record<string, string | number | boolean | string[]> = {};
  for (const field of fields) {
    if (!(field.id in values)) {
      continue;
    }

    const value = values[field.id];
    if (value === null || value === '') {
      continue;
    }

    if (field.type === 'sequence') {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['values', field.id],
          message: 'Sequence values are assigned automatically.'
        }
      ]);
    }

    normalized[field.id] = parseRecordValue(field, value);
  }

  return normalized;
}

function parseRecordValue(
  field: FieldDefinitionForValidation,
  value: unknown
): string | number | boolean | string[] {
  switch (field.type) {
    case 'short_text':
    case 'person':
      return z.string().trim().max(500).parse(value);
    case 'long_text':
      return z.string().max(20_000).parse(value);
    case 'number':
      return z.number().finite().parse(value);
    case 'date':
      return z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(value);
    case 'url':
      return z.string().url().max(2_000).parse(value);
    case 'checkbox':
      return z.boolean().parse(value);
    case 'single_select':
    case 'status':
      return parseOptionId(field, value);
    case 'multi_select': {
      const optionIds = z.array(z.string().min(1)).min(1).max(100).parse(value);
      if (new Set(optionIds).size !== optionIds.length) {
        throw new z.ZodError([
          { code: 'custom', path: [], message: 'Multi-select option IDs must be unique.' }
        ]);
      }
      return optionIds.map((optionId) => parseOptionId(field, optionId));
    }
    case 'sequence':
      throw new Error('Sequence values are handled before parsing.');
  }
}

function parseOptionId(field: FieldDefinitionForValidation, value: unknown): string {
  const optionId = z.string().min(1).parse(value);
  if (!field.config.options?.some((option) => option.id === optionId)) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: [],
        message: `Unknown option ID for field ${field.id}.`
      }
    ]);
  }
  return optionId;
}
