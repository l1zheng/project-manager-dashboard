import { z } from 'zod';
import type { FieldDefinitionForValidation, FieldType } from './index.js';

export const filterOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'greater_or_equal',
  'less_than',
  'less_or_equal',
  'before',
  'after',
  'on_or_before',
  'on_or_after',
  'between',
  'is_any_of',
  'is_none_of',
  'contains_any',
  'contains_all',
  'contains_none',
  'is_checked',
  'is_not_checked',
  'is_empty',
  'is_not_empty'
]);
export type FilterOperator = z.infer<typeof filterOperatorSchema>;

export type FilterCondition = {
  kind: 'condition';
  fieldId: string;
  operator: FilterOperator;
  value?: unknown;
};
export type FilterGroup = {
  kind: 'group';
  conjunction: 'and' | 'or';
  children: FilterExpression[];
};
export type FilterExpression = FilterCondition | FilterGroup;

const conditionSchema: z.ZodType<FilterCondition> = z
  .object({
    kind: z.literal('condition'),
    fieldId: z.string().trim().min(1).max(120),
    operator: filterOperatorSchema,
    value: z.unknown().optional()
  })
  .strict();
export const filterExpressionSchema: z.ZodType<FilterExpression> = z.lazy(() =>
  z.union([
    conditionSchema,
    z
      .object({
        kind: z.literal('group'),
        conjunction: z.enum(['and', 'or']),
        children: z.array(filterExpressionSchema).min(1).max(50)
      })
      .strict()
  ])
);

export type FilterRecord = {
  sequenceNumber: number;
  values: Record<string, string | number | boolean | string[]>;
};

const operatorsByType: Record<FieldType, ReadonlySet<FilterOperator>> = {
  short_text: set('equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'),
  long_text: set('equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'),
  person: set('equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'),
  url: set('equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'),
  number: set(
    'equals',
    'not_equals',
    'greater_than',
    'greater_or_equal',
    'less_than',
    'less_or_equal',
    'is_empty',
    'is_not_empty'
  ),
  sequence: set(
    'equals',
    'not_equals',
    'greater_than',
    'greater_or_equal',
    'less_than',
    'less_or_equal'
  ),
  date: set(
    'equals',
    'not_equals',
    'before',
    'after',
    'on_or_before',
    'on_or_after',
    'between',
    'is_empty',
    'is_not_empty'
  ),
  single_select: set('equals', 'not_equals', 'is_any_of', 'is_none_of', 'is_empty', 'is_not_empty'),
  status: set('equals', 'not_equals', 'is_any_of', 'is_none_of', 'is_empty', 'is_not_empty'),
  multi_select: set('contains_any', 'contains_all', 'contains_none', 'is_empty', 'is_not_empty'),
  checkbox: set('is_checked', 'is_not_checked')
};

const noValueOperators: ReadonlySet<FilterOperator> = set(
  'is_empty',
  'is_not_empty',
  'is_checked',
  'is_not_checked'
);
const listOperators: ReadonlySet<FilterOperator> = set(
  'is_any_of',
  'is_none_of',
  'contains_any',
  'contains_all',
  'contains_none'
);

export function parseFilterExpression(
  input: unknown,
  fields: FieldDefinitionForValidation[]
): FilterExpression {
  assertShapeLimits(input);
  const expression = filterExpressionSchema.parse(input);
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  let nodeCount = 0;
  validateNode(expression, fieldsById, 1, () => {
    nodeCount += 1;
    if (nodeCount > 200) throwFilter([], 'A filter may contain at most 200 nodes.');
  });
  return expression;
}

export function evaluateFilter(
  expression: FilterExpression | null,
  record: FilterRecord,
  fields: FieldDefinitionForValidation[]
): boolean {
  if (expression === null) return true;
  const parsed = parseFilterExpression(expression, fields);
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  return evaluateNode(parsed, record, fieldsById);
}

export function filterRecords<T extends FilterRecord>(
  records: T[],
  expression: FilterExpression | null,
  fields: FieldDefinitionForValidation[]
): T[] {
  if (expression === null) return [...records];
  const parsed = parseFilterExpression(expression, fields);
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  return records.filter((record) => evaluateNode(parsed, record, fieldsById));
}

function validateNode(
  node: FilterExpression,
  fields: Map<string, FieldDefinitionForValidation>,
  depth: number,
  visit: () => void
): void {
  visit();
  if (depth > 8) throwFilter([], 'Filter nesting may not exceed 8 levels.');
  if (node.kind === 'group') {
    node.children.forEach((child) => validateNode(child, fields, depth + 1, visit));
    return;
  }
  const field = fields.get(node.fieldId);
  if (!field) throwFilter(['fieldId'], 'The filter field does not exist or is archived.');
  if (!operatorsByType[field.type].has(node.operator)) {
    throwFilter(['operator'], `${node.operator} is not valid for ${field.type}.`);
  }
  if (noValueOperators.has(node.operator)) {
    if (node.value !== undefined)
      throwFilter(['value'], `${node.operator} does not accept a value.`);
    return;
  }
  if (node.value === undefined) throwFilter(['value'], `${node.operator} requires a value.`);
  if (node.operator === 'between') {
    const [start, end] = z.tuple([dateSchema, dateSchema]).parse(node.value);
    if (start > end) throwFilter(['value'], 'A date range must start on or before it ends.');
  } else if (listOperators.has(node.operator)) {
    const values = z.array(z.string().min(1)).min(1).max(100).parse(node.value);
    if (new Set(values).size !== values.length)
      throwFilter(['value'], 'Filter values must be unique.');
    validateOptionIds(field, values);
  } else if (field.type === 'number' || field.type === 'sequence') {
    z.number().finite().parse(node.value);
  } else if (field.type === 'date') {
    dateSchema.parse(node.value);
  } else {
    const value = z.string().min(1).parse(node.value);
    if (field.type === 'single_select' || field.type === 'status')
      validateOptionIds(field, [value]);
  }
}

function evaluateNode(
  node: FilterExpression,
  record: FilterRecord,
  fields: Map<string, FieldDefinitionForValidation>
): boolean {
  if (node.kind === 'group') {
    return node.conjunction === 'and'
      ? node.children.every((child) => evaluateNode(child, record, fields))
      : node.children.some((child) => evaluateNode(child, record, fields));
  }
  const field = fields.get(node.fieldId)!;
  const actual = field.type === 'sequence' ? record.sequenceNumber : record.values[field.id];
  if (node.operator === 'is_empty') return isEmpty(actual);
  if (node.operator === 'is_not_empty') return !isEmpty(actual);
  if (node.operator === 'is_checked') return actual === true;
  if (node.operator === 'is_not_checked') return actual !== true;
  const expected = node.value as string | number | string[];
  switch (node.operator) {
    case 'equals':
      return actual === expected;
    case 'not_equals':
      return actual !== expected;
    case 'contains':
      return (
        typeof actual === 'string' && actual.toLowerCase().includes(String(expected).toLowerCase())
      );
    case 'not_contains':
      return (
        typeof actual !== 'string' || !actual.toLowerCase().includes(String(expected).toLowerCase())
      );
    case 'greater_than':
      return typeof actual === 'number' && actual > Number(expected);
    case 'greater_or_equal':
      return typeof actual === 'number' && actual >= Number(expected);
    case 'less_than':
      return typeof actual === 'number' && actual < Number(expected);
    case 'less_or_equal':
      return typeof actual === 'number' && actual <= Number(expected);
    case 'before':
      return typeof actual === 'string' && actual < String(expected);
    case 'after':
      return typeof actual === 'string' && actual > String(expected);
    case 'on_or_before':
      return typeof actual === 'string' && actual <= String(expected);
    case 'on_or_after':
      return typeof actual === 'string' && actual >= String(expected);
    case 'between': {
      const range = expected as string[];
      return typeof actual === 'string' && actual >= range[0]! && actual <= range[1]!;
    }
    case 'is_any_of':
      return typeof actual === 'string' && (expected as string[]).includes(actual);
    case 'is_none_of':
      return typeof actual !== 'string' || !(expected as string[]).includes(actual);
    case 'contains_any':
      return (
        Array.isArray(actual) && (expected as string[]).some((value) => actual.includes(value))
      );
    case 'contains_all':
      return (
        Array.isArray(actual) && (expected as string[]).every((value) => actual.includes(value))
      );
    case 'contains_none':
      return (
        !Array.isArray(actual) || (expected as string[]).every((value) => !actual.includes(value))
      );
    default:
      return false;
  }
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function validateOptionIds(field: FieldDefinitionForValidation, values: string[]): void {
  const allowed = new Set(field.config.options?.map((option) => option.id));
  if (values.some((value) => !allowed.has(value)))
    throwFilter(['value'], 'The filter contains an unknown option ID.');
}

function assertShapeLimits(input: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: input, depth: 1 }];
  let count = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    count += 1;
    if (count > 200) throwFilter([], 'A filter may contain at most 200 nodes.');
    if (current.depth > 8) throwFilter([], 'Filter nesting may not exceed 8 levels.');
    if (
      current.value &&
      typeof current.value === 'object' &&
      'kind' in current.value &&
      current.value.kind === 'group' &&
      'children' in current.value &&
      Array.isArray(current.value.children)
    ) {
      current.value.children.forEach((child) =>
        pending.push({ value: child, depth: current.depth + 1 })
      );
    }
  }
}

function set<T extends string>(...values: T[]): ReadonlySet<T> {
  return new Set(values);
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function throwFilter(path: PropertyKey[], message: string): never {
  throw new z.ZodError([{ code: 'custom', path, message }]);
}
