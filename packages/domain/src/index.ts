import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('project-manager-api'),
  timestamp: z.string().datetime()
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
