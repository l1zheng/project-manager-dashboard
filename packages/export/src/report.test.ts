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
              { id: 'risk', name: '风险描述', type: 'long_text', config: {} },
              { id: 'skip', name: '跳过', type: 'short_text', config: {} }
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
              { id: 'sequence', name: '序号', type: 'sequence', config: {} },
              {
                id: 'status',
                name: '状态',
                type: 'status',
                config: { options: [{ id: 'done', label: '已完成' }] }
              }
            ],
            records: [{ id: 'r1', sequenceNumber: 7, values: { status: 'done' } }]
          }
        }
      ]
    });
    expect(model.sections[0]?.rows[0]?.values).toEqual([7, '已完成']);
  });
});
