import { describe, expect, it } from 'vitest';
import {
  createDashboardBlockInputSchema,
  parseDashboardBlockConfig,
  reorderDashboardBlocksInputSchema,
  updateDashboardBlockInputSchema
} from './index.js';

describe('dashboard block configuration', () => {
  it('projects legacy table-block input into the versioned polymorphic contract', () => {
    expect(
      createDashboardBlockInputSchema.parse({
        viewId: 'view-1',
        titleOverride: '重点需求',
        description: '本周范围',
        includeInExport: false
      })
    ).toEqual({
      kind: 'table_view',
      viewId: 'view-1',
      mediaAssetId: null,
      config: {
        version: 1,
        titleOverride: '重点需求',
        description: '本周范围'
      },
      isCollapsed: undefined,
      includeInExport: false
    });
  });

  it('validates text and pending-image modules without accepting cross-kind references', () => {
    expect(
      createDashboardBlockInputSchema.parse({
        kind: 'text',
        config: { version: 1, title: '本周摘要', body: '按计划推进。' }
      })
    ).toMatchObject({ kind: 'text', viewId: null, mediaAssetId: null });
    expect(
      createDashboardBlockInputSchema.parse({
        kind: 'image',
        mediaAssetId: null,
        config: { version: 1, title: null, caption: null }
      })
    ).toMatchObject({ kind: 'image', viewId: null, mediaAssetId: null });
    expect(() =>
      createDashboardBlockInputSchema.parse({
        kind: 'text',
        viewId: 'view-1',
        config: { version: 1, title: '错误', body: '' }
      })
    ).toThrow();
  });

  it('keeps configuration strict and requires meaningful block updates', () => {
    expect(() =>
      parseDashboardBlockConfig('image', {
        version: 1,
        title: null,
        caption: null,
        externalUrl: 'https://example.com/image.png'
      })
    ).toThrow();
    expect(() => updateDashboardBlockInputSchema.parse({})).toThrow();
    expect(() => reorderDashboardBlocksInputSchema.parse({ blockIds: ['a', 'a'] })).toThrow();
  });
});
