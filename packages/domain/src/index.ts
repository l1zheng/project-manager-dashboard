import { z } from 'zod';

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
      })
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
