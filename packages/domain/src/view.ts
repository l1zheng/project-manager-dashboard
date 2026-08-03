import { z } from 'zod';
import {
  filterRecords,
  parseFilterExpression,
  type FilterExpression,
  type FilterRecord
} from './filter.js';
import type { FieldDefinitionForValidation } from './index.js';

export const sortDirectionSchema = z.enum(['ascending', 'descending']);
export type SortDirection = z.infer<typeof sortDirectionSchema>;
export const sortClauseSchema = z
  .object({
    fieldId: z.string().trim().min(1).max(120),
    direction: sortDirectionSchema
  })
  .strict();
export type SortClause = z.infer<typeof sortClauseSchema>;

export type ViewConfig = {
  version: 1;
  visibleFieldIds: string[];
  fieldWidths: Record<string, number>;
  filter: FilterExpression | null;
  sorts: SortClause[];
  includeArchived: boolean;
};

const viewConfigSchema = z
  .object({
    version: z.literal(1),
    visibleFieldIds: z.array(z.string().trim().min(1).max(120)).max(100),
    fieldWidths: z
      .record(z.string().trim().min(1).max(120), z.number().int().min(60).max(1200))
      .default({}),
    filter: z.unknown().nullable().default(null),
    sorts: z.array(sortClauseSchema).max(10).default([]),
    includeArchived: z.boolean().default(false)
  })
  .strict();

export function parseViewConfig(
  input: unknown,
  fields: FieldDefinitionForValidation[]
): ViewConfig {
  const raw = viewConfigSchema.parse(input);
  const fieldIds = new Set(fields.map((field) => field.id));
  assertKnownUniqueIds(raw.visibleFieldIds, fieldIds, 'visibleFieldIds');
  assertKnownUniqueIds(Object.keys(raw.fieldWidths), fieldIds, 'fieldWidths');
  assertKnownUniqueIds(
    raw.sorts.map((sort) => sort.fieldId),
    fieldIds,
    'sorts'
  );
  return {
    ...raw,
    filter: raw.filter === null ? null : parseFilterExpression(raw.filter, fields)
  };
}

export function evaluateViewRecords<T extends FilterRecord>(
  records: T[],
  config: ViewConfig,
  fields: FieldDefinitionForValidation[]
): T[] {
  const filtered = filterRecords(records, config.filter, fields);
  return [...filtered].sort((left, right) => compareRecords(left, right, config.sorts, fields));
}

function compareRecords(
  left: FilterRecord,
  right: FilterRecord,
  sorts: SortClause[],
  fields: FieldDefinitionForValidation[]
): number {
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  for (const sort of sorts) {
    const field = fieldsById.get(sort.fieldId)!;
    const leftValue = field.type === 'sequence' ? left.sequenceNumber : left.values[field.id];
    const rightValue = field.type === 'sequence' ? right.sequenceNumber : right.values[field.id];
    const compared = compareValue(leftValue, rightValue);
    if (compared !== 0) return sort.direction === 'ascending' ? compared : -compared;
  }
  return left.sequenceNumber - right.sequenceNumber;
}

function compareValue(left: unknown, right: unknown): number {
  const leftEmpty =
    left === undefined ||
    left === null ||
    left === '' ||
    (Array.isArray(left) && left.length === 0);
  const rightEmpty =
    right === undefined ||
    right === null ||
    right === '' ||
    (Array.isArray(right) && right.length === 0);
  if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right);
  return String(Array.isArray(left) ? left.join('\u0000') : left).localeCompare(
    String(Array.isArray(right) ? right.join('\u0000') : right),
    'zh-Hans-CN',
    { numeric: true }
  );
}

function assertKnownUniqueIds(ids: string[], known: Set<string>, path: string): void {
  if (new Set(ids).size !== ids.length)
    throw new z.ZodError([{ code: 'custom', path: [path], message: 'Field IDs must be unique.' }]);
  if (ids.some((id) => !known.has(id)))
    throw new z.ZodError([
      { code: 'custom', path: [path], message: 'A referenced field does not exist or is archived.' }
    ]);
}
