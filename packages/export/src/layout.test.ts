import { describe, expect, it } from 'vitest';
import { calculatePresentationGridLayout } from './layout.js';

describe('presentation Excel base-grid layout', () => {
  it('allocates all 60 columns continuously and favors business text', () => {
    const layout = calculatePresentationGridLayout([
      { id: 'sequence', name: '序号', type: 'sequence', sampleValues: [1, 2, 3] },
      { id: 'requirement', name: '需求名称', type: 'short_text', sampleValues: ['支持单点登录'] },
      {
        id: 'progress',
        name: '当前进展',
        type: 'long_text',
        sampleValues: ['接口设计已评审，等待安全组确认权限范围。']
      },
      { id: 'plan', name: '交付计划', type: 'date', sampleValues: ['2026-08-14'] },
      { id: 'owner', name: '责任人', type: 'person', sampleValues: ['张三'] },
      { id: 'status', name: '状态', type: 'status', sampleValues: ['进行中'] }
    ]);

    expect(layout.compressed).toBe(false);
    expect(layout.fields.reduce((total, field) => total + field.span, 0)).toBe(60);
    expect(layout.fields[0]?.startColumn).toBe(1);
    expect(layout.fields.at(-1)?.endColumn).toBe(60);
    expect(layout.fields.find((field) => field.fieldId === 'progress')!.span).toBeGreaterThan(
      layout.fields.find((field) => field.fieldId === 'status')!.span
    );
    expect(layout.fields.find((field) => field.fieldId === 'requirement')!.span).toBeGreaterThan(
      layout.fields.find((field) => field.fieldId === 'sequence')!.span
    );
  });

  it('gives a wider saved-view field more space when other inputs match', () => {
    const layout = calculatePresentationGridLayout([
      { id: 'narrow', name: '事项', type: 'short_text', width: 100, sampleValues: ['相同内容'] },
      { id: 'wide', name: '事项', type: 'short_text', width: 400, sampleValues: ['相同内容'] }
    ]);

    expect(layout.fields[1]!.span).toBeGreaterThan(layout.fields[0]!.span);
    expect(layout.fields[0]!.span + layout.fields[1]!.span).toBe(60);
  });

  it('uses deterministic input order to break equal largest-remainder ties', () => {
    const layout = calculatePresentationGridLayout(
      ['a', 'b', 'c', 'd'].map((id) => ({ id, name: '列', type: 'short_text' as const })),
      11
    );

    expect(layout.compressed).toBe(true);
    expect(layout.fields.map((field) => field.span)).toEqual([3, 3, 3, 2]);
    expect(layout.fields.map((field) => [field.startColumn, field.endColumn])).toEqual([
      [1, 3],
      [4, 6],
      [7, 9],
      [10, 11]
    ]);
  });

  it('compresses dense layouts to one column per field and rejects impossible grids', () => {
    const fields = Array.from({ length: 60 }, (_, index) => ({
      id: `field-${index}`,
      name: `字段${index}`,
      type: 'long_text' as const
    }));
    const layout = calculatePresentationGridLayout(fields);

    expect(layout.compressed).toBe(true);
    expect(layout.fields.every((field) => field.span === 1)).toBe(true);
    expect(() =>
      calculatePresentationGridLayout([
        ...fields,
        { id: 'field-60', name: '字段60', type: 'long_text' }
      ])
    ).toThrow(/60 columns.*61 visible fields/);
  });

  it('rejects duplicate field IDs and invalid grid widths', () => {
    expect(() =>
      calculatePresentationGridLayout([
        { id: 'same', name: '甲', type: 'short_text' },
        { id: 'same', name: '乙', type: 'short_text' }
      ])
    ).toThrow(/unique/);
    expect(() => calculatePresentationGridLayout([], 0)).toThrow(/positive integer/);
  });
});
