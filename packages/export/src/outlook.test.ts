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

  it('renders text, table, and CID image blocks in canonical order', () => {
    const table = {
      kind: 'table' as const,
      blockId: 'requirements',
      title: '需求跟踪',
      description: null,
      includeInExport: true,
      fields: [{ id: 'status', name: '状态', type: 'status' as const, width: 100 }],
      rows: [{ recordId: 'r1', values: ['进行中'] }]
    };
    const report = renderOutlookReport(
      {
        version: 1,
        title: '项目周报',
        period: null,
        density: 'comfortable',
        includeEmptySections: true,
        includeCompleted: true,
        highlightStatus: true,
        blocks: [
          {
            kind: 'text',
            blockId: 'summary',
            title: '本周摘要',
            body: '第一行\n第二行',
            includeInExport: true
          },
          table,
          {
            kind: 'image',
            blockId: 'architecture',
            title: '架构图',
            caption: '当前基线',
            includeInExport: true,
            asset: {
              id: 'asset-1',
              mimeType: 'image/png',
              byteLength: 10,
              originalFilename: '架构.png',
              contentUrl: '/api/media-assets/asset-1/content'
            }
          }
        ],
        sections: [table]
      },
      { imageSource: () => 'cid:pm-asset-1@local' }
    );

    expect(report.htmlFragment.indexOf('本周摘要')).toBeLessThan(
      report.htmlFragment.indexOf('需求跟踪')
    );
    expect(report.htmlFragment.indexOf('需求跟踪')).toBeLessThan(
      report.htmlFragment.indexOf('架构图')
    );
    expect(report.htmlFragment).toContain('第一行<br>第二行');
    expect(report.htmlFragment).toContain('src="cid:pm-asset-1@local"');
    expect(report.plainText).toContain('[图片]');
  });
});
