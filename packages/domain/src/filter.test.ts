import { describe, expect, it } from 'vitest';
import {
  evaluateFilter,
  filterRecords,
  parseFilterExpression,
  type FieldDefinitionForValidation,
  type FilterRecord
} from './index.js';

const fields: FieldDefinitionForValidation[] = [
  { id: 'title', type: 'short_text', config: { version: 1 } },
  { id: 'progress', type: 'number', config: { version: 1 } },
  { id: 'delivery', type: 'date', config: { version: 1 } },
  {
    id: 'status',
    type: 'status',
    config: {
      version: 1,
      options: [
        { id: 'todo', label: '未开始' },
        { id: 'doing', label: '进行中' },
        { id: 'done', label: '已完成' }
      ]
    }
  },
  {
    id: 'tags',
    type: 'multi_select',
    config: {
      version: 1,
      options: [
        { id: 'urgent', label: '紧急' },
        { id: 'external', label: '外部' }
      ]
    }
  },
  { id: 'blocked', type: 'checkbox', config: { version: 1 } },
  { id: 'sequence', type: 'sequence', config: { version: 1 } }
];

const records: FilterRecord[] = [
  {
    sequenceNumber: 1,
    values: {
      title: '支持单点登录',
      progress: 60,
      delivery: '2026-08-08',
      status: 'doing',
      tags: ['urgent'],
      blocked: false
    }
  },
  {
    sequenceNumber: 2,
    values: {
      title: '导出周报',
      progress: 100,
      delivery: '2026-08-01',
      status: 'done',
      tags: ['external'],
      blocked: true
    }
  },
  { sequenceNumber: 3, values: { title: '待澄清事项', progress: 0 } }
];

describe('typed filter evaluator', () => {
  it('evaluates nested AND/OR groups deterministically', () => {
    const expression = {
      kind: 'group' as const,
      conjunction: 'and' as const,
      children: [
        {
          kind: 'condition' as const,
          fieldId: 'title',
          operator: 'contains' as const,
          value: '支持'
        },
        {
          kind: 'group' as const,
          conjunction: 'or' as const,
          children: [
            {
              kind: 'condition' as const,
              fieldId: 'progress',
              operator: 'greater_or_equal' as const,
              value: 50
            },
            { kind: 'condition' as const, fieldId: 'blocked', operator: 'is_checked' as const }
          ]
        }
      ]
    };
    expect(
      filterRecords(records, expression, fields).map((record) => record.sequenceNumber)
    ).toEqual([1]);
  });

  it('supports date ranges, stable option IDs, multi-selects, and sequence values', () => {
    expect(
      evaluateFilter(
        {
          kind: 'condition',
          fieldId: 'delivery',
          operator: 'between',
          value: ['2026-08-01', '2026-08-08']
        },
        records[0]!,
        fields
      )
    ).toBe(true);
    expect(
      evaluateFilter(
        { kind: 'condition', fieldId: 'status', operator: 'is_any_of', value: ['doing'] },
        records[0]!,
        fields
      )
    ).toBe(true);
    expect(
      evaluateFilter(
        { kind: 'condition', fieldId: 'tags', operator: 'contains_all', value: ['urgent'] },
        records[0]!,
        fields
      )
    ).toBe(true);
    expect(
      evaluateFilter(
        { kind: 'condition', fieldId: 'sequence', operator: 'greater_than', value: 2 },
        records[2]!,
        fields
      )
    ).toBe(true);
  });

  it('uses explicit empty semantics and treats null expression as no filter', () => {
    expect(filterRecords(records, null, fields)).toEqual(records);
    expect(
      evaluateFilter(
        { kind: 'condition', fieldId: 'status', operator: 'is_empty' },
        records[2]!,
        fields
      )
    ).toBe(true);
    expect(
      evaluateFilter(
        { kind: 'condition', fieldId: 'blocked', operator: 'is_not_checked' },
        records[2]!,
        fields
      )
    ).toBe(true);
  });

  it('rejects incompatible operators, archived fields, unknown options, and empty groups', () => {
    expect(() =>
      parseFilterExpression(
        { kind: 'condition', fieldId: 'progress', operator: 'contains', value: '6' },
        fields
      )
    ).toThrow();
    expect(() =>
      parseFilterExpression({ kind: 'condition', fieldId: 'missing', operator: 'is_empty' }, fields)
    ).toThrow();
    expect(() =>
      parseFilterExpression(
        { kind: 'condition', fieldId: 'status', operator: 'equals', value: 'renamed-label' },
        fields
      )
    ).toThrow();
    expect(() =>
      parseFilterExpression({ kind: 'group', conjunction: 'and', children: [] }, fields)
    ).toThrow();
    expect(() =>
      parseFilterExpression(
        {
          kind: 'condition',
          fieldId: 'delivery',
          operator: 'between',
          value: ['2026-08-09', '2026-08-01']
        },
        fields
      )
    ).toThrow();
  });
});
