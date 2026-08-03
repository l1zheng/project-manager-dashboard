import { describe, expect, it } from 'vitest';
import { buildReportModel, renderReportHtml } from './report.js';

describe('report model', () => {
  it('projects saved visible fields and escapes rendered user content', () => {
    const model = buildReportModel({
      dashboard: { name: '周报' },
      blocks: [
        {
          id: 'b1',
          titleOverride: null,
          description: '<说明>',
          includeInExport: true,
          view: {
            view: { name: '风险', config: { visibleFieldIds: ['risk'], fieldWidths: {} } },
            fields: [
              { id: 'risk', name: '风险描述', type: 'long_text', config: { version: 1 } },
              { id: 'skip', name: '跳过', type: 'short_text', config: { version: 1 } }
            ],
            records: [{ id: 'r1', sequenceNumber: 1, values: { risk: '<script>', skip: 'x' } }]
          }
        }
      ]
    });
    expect(model.sections[0]?.fields).toHaveLength(1);
    expect(renderReportHtml(model)).toContain('&lt;script&gt;');
    expect(renderReportHtml(model)).not.toContain('<script>');
  });

  it('renders sequence numbers and option labels instead of storage IDs', () => {
    const model = buildReportModel({
      dashboard: { name: '周报' },
      blocks: [
        {
          id: 'b1',
          titleOverride: null,
          description: null,
          includeInExport: true,
          view: {
            view: {
              name: '需求',
              config: { visibleFieldIds: ['sequence', 'status'], fieldWidths: {} }
            },
            fields: [
              { id: 'sequence', name: '序号', type: 'sequence', config: { version: 1 } },
              {
                id: 'status',
                name: '状态',
                type: 'status',
                config: { version: 1, options: [{ id: 'done', label: '已完成' }] }
              }
            ],
            records: [{ id: 'r1', sequenceNumber: 7, values: { status: 'done' } }]
          }
        }
      ]
    });
    expect(model.sections[0]?.rows[0]?.values).toEqual([7, '已完成']);
  });

  it('removes explicitly completed rows even when the completion field is hidden', () => {
    const source = {
      dashboard: { name: '周报' },
      blocks: [
        {
          id: 'b1',
          titleOverride: null,
          description: null,
          includeInExport: true,
          view: {
            view: { name: '需求', config: { visibleFieldIds: ['title'], fieldWidths: {} } },
            fields: [
              {
                id: 'title',
                name: '需求名称',
                type: 'short_text' as const,
                config: { version: 1 as const }
              },
              {
                id: 'status',
                name: '状态',
                type: 'status' as const,
                config: {
                  version: 1 as const,
                  options: [
                    { id: 'open', label: 'Open' },
                    { id: 'closed', label: 'Closed' },
                    { id: 'suspended', label: 'Suspended' }
                  ],
                  completion: { completedOptionIds: ['closed'] }
                }
              }
            ],
            records: [
              { id: 'r-open', sequenceNumber: 1, values: { title: '继续推进', status: 'open' } },
              {
                id: 'r-closed',
                sequenceNumber: 2,
                values: { title: '已经关闭', status: 'closed' }
              },
              {
                id: 'r-suspended',
                sequenceNumber: 3,
                values: { title: '暂缓处理', status: 'suspended' }
              }
            ]
          }
        }
      ]
    };

    expect(buildReportModel(source).sections[0]?.rows).toHaveLength(3);
    expect(
      buildReportModel(source, { includeCompleted: false }).sections[0]?.rows.map(
        (row) => row.recordId
      )
    ).toEqual(['r-open', 'r-suspended']);
  });
});
