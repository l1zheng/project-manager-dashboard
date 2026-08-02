import { describe, expect, it } from 'vitest';
import {
  fieldTypeSchema,
  healthResponseSchema,
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
});
