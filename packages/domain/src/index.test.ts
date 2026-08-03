import { describe, expect, it } from 'vitest';
import {
  fieldTypeSchema,
  healthResponseSchema,
  isRecordCompleted,
  parseFieldConfig,
  validateRecordValues
} from './index.js';

describe('shared domain contracts', () => {
  it('accepts the local API health response', () => {
    expect(
      healthResponseSchema.parse({
        status: 'ok',
        service: 'project-manager-api',
        timestamp: '2026-08-03T12:00:00.000Z'
      })
    ).toMatchObject({ status: 'ok' });
  });

  it('includes the first-release field types', () => {
    expect(fieldTypeSchema.parse('status')).toBe('status');
    expect(fieldTypeSchema.parse('sequence')).toBe('sequence');
  });

  it('validates option-backed values by stable option ID', () => {
    const config = parseFieldConfig('status', {
      version: 1,
      options: [{ id: 'in-progress', label: '进行中' }]
    });

    expect(
      validateRecordValues([{ id: 'status-field', type: 'status', config }], {
        'status-field': 'in-progress'
      })
    ).toEqual({ 'status-field': 'in-progress' });
    expect(() =>
      validateRecordValues([{ id: 'status-field', type: 'status', config }], {
        'status-field': 'missing-option'
      })
    ).toThrow();
  });

  it('uses explicit stable status option IDs for completion semantics', () => {
    const config = parseFieldConfig('status', {
      version: 1,
      options: [
        { id: 'open', label: 'Open' },
        { id: 'closed', label: 'Closed' },
        { id: 'suspended', label: 'Suspended' }
      ],
      completion: { completedOptionIds: ['closed'] }
    });
    const fields = [{ id: 'status-field', type: 'status' as const, config }];

    expect(isRecordCompleted(fields, { 'status-field': 'closed' })).toBe(true);
    expect(isRecordCompleted(fields, { 'status-field': 'open' })).toBe(false);
    expect(isRecordCompleted(fields, { 'status-field': 'suspended' })).toBe(false);
  });

  it('rejects completion settings on non-status fields and unknown option IDs', () => {
    expect(() =>
      parseFieldConfig('single_select', {
        version: 1,
        options: [{ id: 'closed', label: 'Closed' }],
        completion: { completedOptionIds: ['closed'] }
      })
    ).toThrow();
    expect(() =>
      parseFieldConfig('status', {
        version: 1,
        options: [{ id: 'open', label: 'Open' }],
        completion: { completedOptionIds: ['missing'] }
      })
    ).toThrow();
  });
});
