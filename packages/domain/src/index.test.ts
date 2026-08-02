import { describe, expect, it } from 'vitest';
import { fieldTypeSchema, healthResponseSchema } from './index.js';

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
});
