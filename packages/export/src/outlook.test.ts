import { describe, expect, it } from 'vitest';
import { normalizeMailSubject, renderOutlookReport } from './outlook.js';

describe('Outlook report rendering', () => {
  it('creates escaped HTML, a text fallback, and a single-line subject', () => {
    const report = renderOutlookReport({
      version: 1,
      title: '第32周\n项目周报',
      period: '2026年第32周',
      density: 'comfortable',
      includeEmptySections: false,
      includeCompleted: true,
      highlightStatus: true,
      sections: [
        {
          blockId: 'risk',
          title: '关键风险',
          description: '<说明>',
          includeInExport: true,
          fields: [
            { id: 'risk', name: '风险描述', type: 'long_text', width: 300 },
            { id: 'status', name: '状态', type: 'status', width: 100 }
          ],
          rows: [{ recordId: 'r1', values: ['<script>alert(1)</script>', '跟踪中'] }]
        }
      ]
    });

    expect(report.subject).toBe('第32周 项目周报');
    expect(report.htmlFragment).toContain('&lt;script&gt;');
    expect(report.htmlFragment).not.toContain('<script>');
    expect(report.htmlDocument).toContain('<!doctype html>');
    expect(report.htmlDocument).not.toContain('<script>');
    expect(report.plainText).toContain('<script>alert(1)</script>');
    expect(report.plainText).toContain('关键风险');
  });

  it('removes control characters and bounds subjects', () => {
    expect(normalizeMailSubject('\u0000  第一行\r\n第二行  ')).toBe('第一行 第二行');
    expect(Array.from(normalizeMailSubject('周'.repeat(200)))).toHaveLength(120);
  });
});
