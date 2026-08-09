import { describe, expect, it } from 'vitest';
import { buildReportModel, renderReportHtml } from './report.js';

describe('report model', () => {
  it('preserves mixed module order while keeping editable-table sections separate', () => {
    const model = buildReportModel({
      dashboard: { name: '周报' },
      blocks: [
        {
          id: 'text-1',
          kind: 'text',
          includeInExport: true,
          config: { version: 1, title: '本周摘要', body: '按计划推进。' }
        },
        {
          id: 'table-1',
          kind: 'table_view',
          titleOverride: null,
          description: null,
          includeInExport: true,
          view: {
            database: { name: '需求跟踪' },
            view: {
              name: '表格',
              config: {
                visibleFieldIds: ['title'],
                fieldWidths: { title: 280 },
                fieldPresentation: {
                  title: { reportAlign: 'center', reportEmphasis: 'strong' }
                }
              }
            },
            fields: [{ id: 'title', name: '需求描述', type: 'long_text', config: { version: 1 } }],
            records: [{ id: 'r1', sequenceNumber: 1, values: { title: '统一身份认证' } }]
          }
        },
        {
          id: 'image-1',
          kind: 'image',
          includeInExport: true,
          config: { version: 1, title: '项目架构', caption: null },
          asset: {
            id: 'asset-1',
            mimeType: 'image/png',
            byteLength: 8,
            originalFilename: '架构.png',
            contentUrl: '/api/media-assets/asset-1/content'
          }
        }
      ]
    });

    expect(model.blocks?.map((block) => block.kind)).toEqual(['text', 'table', 'image']);
    expect(model.sections).toHaveLength(1);
    expect(model.sections[0]?.fields[0]).toMatchObject({
      reportAlign: 'center',
      reportEmphasis: 'strong'
    });
  });

  it('projects saved visible fields and escapes rendered user content', () => {
    const model = buildReportModel({
      dashboard: { name: '周报' },
      blocks: [
        {
          id: 'b1',
          kind: 'table_view',
          titleOverride: null,
          description: '<说明>',
          includeInExport: true,
          view: {
            database: { name: '关键风险' },
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
    expect(model.sections[0]?.title).toBe('关键风险');
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
          kind: 'table_view',
          titleOverride: null,
          description: null,
          includeInExport: true,
          view: {
            database: { name: '需求跟踪' },
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
    expect(model.sections[0]?.description).toBeNull();
    expect(model.sections[0]?.rows[0]?.values).toEqual([7, '已完成']);
  });

  it('removes explicitly completed rows even when the completion field is hidden', () => {
    const source = {
      dashboard: { name: '周报' },
      blocks: [
        {
          id: 'b1',
          kind: 'table_view' as const,
          titleOverride: null,
          description: null,
          includeInExport: true,
          view: {
            database: { name: '需求跟踪' },
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
