import { describe, expect, it } from 'vitest';
import {
  evaluateViewRecords,
  parseViewConfig,
  type FieldDefinitionForValidation,
  type FilterRecord
} from './index.js';

const fields: FieldDefinitionForValidation[] = [
  { id: 'title', type: 'short_text', config: { version: 1 } },
  { id: 'priority', type: 'number', config: { version: 1 } },
  {
    id: 'status',
    type: 'status',
    config: { version: 1, options: [{ id: 'doing', label: '进行中' }] }
  },
  { id: 'sequence', type: 'sequence', config: { version: 1 } }
];
const records: FilterRecord[] = [
  { sequenceNumber: 1, values: { title: '甲', priority: 2, status: 'doing' } },
  { sequenceNumber: 2, values: { title: '乙', priority: 1 } },
  { sequenceNumber: 3, values: { title: '丙', priority: 3, status: 'doing' } }
];

describe('view configuration', () => {
  it('filters then applies stable typed sorting with empty values last', () => {
    const config = parseViewConfig(
      {
        version: 1,
        visibleFieldIds: ['title', 'priority'],
        fieldWidths: { title: 320 },
        filter: { kind: 'condition', fieldId: 'status', operator: 'equals', value: 'doing' },
        sorts: [{ fieldId: 'priority', direction: 'descending' }],
        includeArchived: false
      },
      fields
    );
    expect(
      evaluateViewRecords(records, config, fields).map((record) => record.sequenceNumber)
    ).toEqual([3, 1]);
  });

  it('rejects unknown and duplicate field references', () => {
    expect(() =>
      parseViewConfig({ version: 1, visibleFieldIds: ['title', 'title'], filter: null }, fields)
    ).toThrow();
    expect(() =>
      parseViewConfig({ version: 1, visibleFieldIds: ['gone'], filter: null }, fields)
    ).toThrow();
  });
});
