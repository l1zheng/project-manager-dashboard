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
              { id: 'risk', name: '风险描述', type: 'long_text' },
              { id: 'skip', name: '跳过', type: 'short_text' }
            ],
            records: [{ id: 'r1', values: { risk: '<script>', skip: 'x' } }]
          }
        }
      ]
    });
    expect(model.sections[0]?.fields).toHaveLength(1);
    expect(renderReportHtml(model)).toContain('&lt;script&gt;');
    expect(renderReportHtml(model)).not.toContain('<script>');
  });
});
