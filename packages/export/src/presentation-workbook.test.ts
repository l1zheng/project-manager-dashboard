import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildPresentationWorkbook } from './presentation-workbook.js';
import type { ReportModel } from './report.js';

describe('presentation Excel workbook', () => {
  it('renders differently shaped sections on one 60-column merged report sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildPresentationWorkbook(reportModel())) as never);

    expect(workbook.worksheets).toHaveLength(1);
    const worksheet = workbook.worksheets[0]!;
    expect(worksheet.name).toBe('项目周报');
    expect(worksheet.columnCount).toBe(60);
    expect(worksheet.pageSetup.orientation).toBe('landscape');
    expect(worksheet.pageSetup.fitToWidth).toBe(1);
    expect(worksheet.pageSetup.printArea).toContain('BH');
    expect(worksheet.getCell('A1').value).toBe('第32周项目周报');
    expect(worksheet.getCell('A4').value).toBe('需求跟踪');
    expect(worksheet.getCell('A8').value).toBe('关键风险');
    expect(worksheet.model.merges).toContain('A1:BH1');
    expect(worksheet.model.merges).toContain('A4:BH4');
    expect(worksheet.model.merges).toContain('A8:BH8');
    expect(worksheet.getCell('A6').value).toBe(1);
    expect(worksheet.getCell('A6').numFmt).toBe('0');
    expect(worksheet.getCell('A6').alignment.horizontal).toBe('center');
    const dateCell = findCell(worksheet, (value) => value instanceof Date);
    expect(dateCell.value).toBeInstanceOf(Date);
    expect((dateCell.value as Date).toISOString().slice(0, 10)).toBe('2026-08-14');
    expect(dateCell.numFmt).toBe('yyyy-mm-dd');
    const riskCell = findCell(worksheet, (value) => value === '登录延迟风险');
    expect(riskCell.value).toBe('登录延迟风险');
    expect(riskCell.alignment.horizontal).toBe('center');
    expect(riskCell.font.color?.argb).toBe('FF243447');
    const requirementCell = findCell(worksheet, (value) => value === '支持统一认证');
    expect(requirementCell.font.bold).toBe(true);
    expect(worksheet.views[0]?.showGridLines).toBe(false);
    expect(worksheet.getCell('A4').fill).toMatchObject({
      fgColor: { argb: 'FFE8F0F5' }
    });
    expect(worksheet.getCell('A4').border.top).toBeUndefined();
    expect(worksheet.getCell('A4').border.bottom?.style).toBe('medium');
    expect(worksheet.getCell('A6').border.top?.style).toBe('thin');
    expect(worksheet.getCell('A6').border.top?.color?.argb).toBe('FF000000');
    expect(riskCell.border).toMatchObject({
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    });
    expect(riskCell.border.left?.color?.argb).toBe('FF000000');
    const statusCell = findCell(worksheet, (value) => value === '进行中');
    expect(statusCell.fill).toMatchObject({ fgColor: { argb: 'FFE8F1FB' } });
  });

  it('keeps formula-like presentation text literal and has an empty-report fallback', async () => {
    const model = reportModel();
    model.sections[0]!.rows[0]!.values[1] = '=HYPERLINK("https://unsafe.example")';
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildPresentationWorkbook(model)) as never);
    const worksheet = workbook.worksheets[0]!;
    expect(
      findCell(worksheet, (value) => value === `'=HYPERLINK("https://unsafe.example")`).value
    ).toBe(`'=HYPERLINK("https://unsafe.example")`);

    const emptyWorkbook = new ExcelJS.Workbook();
    await emptyWorkbook.xlsx.load(
      (await buildPresentationWorkbook({ ...model, sections: [] })) as never
    );
    expect(emptyWorkbook.worksheets[0]!.getCell('A4').value).toContain('没有符合');
  });

  it('keeps an empty section and leaves an omitted report period blank', async () => {
    const source = reportModel();
    const model: ReportModel = {
      ...source,
      period: null,
      includeEmptySections: true,
      sections: [{ ...source.sections[1]!, rows: [] }]
    };
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildPresentationWorkbook(model)) as never);
    const worksheet = workbook.worksheets[0]!;

    expect(worksheet.getCell('A2').value).toBeNull();
    expect(worksheet.getCell('A4').value).toBe('关键风险');
    expect(findCell(worksheet, (value) => value === '风险消减措施').value).toBe('风险消减措施');
  });

  it('preserves mixed text, table, and embedded-image order', async () => {
    const source = reportModel();
    const imageBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9xkAAAAASUVORK5CYII=',
      'base64'
    );
    const model: ReportModel = {
      ...source,
      blocks: [
        {
          kind: 'text',
          blockId: 'summary',
          title: '本周摘要',
          body: '需求联调按计划推进。',
          includeInExport: true
        },
        source.sections[0]!,
        {
          kind: 'image',
          blockId: 'architecture',
          title: '项目架构图',
          caption: '本周架构基线',
          includeInExport: true,
          asset: {
            id: 'asset-1',
            mimeType: 'image/png',
            byteLength: imageBytes.length,
            originalFilename: '架构图.png',
            contentUrl: '/api/media-assets/asset-1/content'
          }
        }
      ]
    };
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await buildPresentationWorkbook(model, {
        resolveImage: async () => ({ bytes: imageBytes, mimeType: 'image/png' })
      })) as never
    );
    const worksheet = workbook.worksheets[0]!;

    expect(worksheet.getCell('A4').value).toBe('本周摘要');
    expect(worksheet.getCell('A5').value).toBe('需求联调按计划推进。');
    expect(worksheet.getCell('A7').value).toBe('需求跟踪');
    expect(worksheet.getCell('A11').value).toBe('项目架构图');
    expect(worksheet.getCell('A13').value).toBe('本周架构基线');
    expect(worksheet.getImages()).toHaveLength(1);
  });
});

function findCell(
  worksheet: ExcelJS.Worksheet,
  predicate: (value: ExcelJS.CellValue) => boolean
): ExcelJS.Cell {
  for (let row = 1; row <= worksheet.rowCount; row += 1) {
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      const cell = worksheet.getCell(row, column);
      if (predicate(cell.value)) return cell;
    }
  }
  throw new Error('Expected a matching presentation cell.');
}

function reportModel(): ReportModel {
  return {
    version: 1,
    title: '第32周项目周报',
    period: '2026年第32周',
    density: 'comfortable',
    includeEmptySections: false,
    includeCompleted: true,
    highlightStatus: true,
    sections: [
      {
        blockId: 'requirements',
        title: '需求跟踪',
        description: null,
        includeInExport: true,
        fields: [
          { id: 'sequence', name: '序号', type: 'sequence', width: 80 },
          {
            id: 'name',
            name: '需求名称',
            type: 'short_text',
            width: 220,
            reportEmphasis: 'strong'
          },
          { id: 'plan', name: '交付计划', type: 'date', width: 120 },
          { id: 'status', name: '状态', type: 'status', width: 120 }
        ],
        rows: [{ recordId: 'r1', values: [1, '支持统一认证', '2026-08-14', '进行中'] }]
      },
      {
        blockId: 'risks',
        title: '关键风险',
        description: '需要重点跟踪的风险与消减措施。',
        includeInExport: true,
        fields: [
          {
            id: 'risk',
            name: '风险描述',
            type: 'long_text',
            width: 260,
            reportAlign: 'center'
          },
          { id: 'mitigation', name: '风险消减措施', type: 'long_text', width: 300 },
          { id: 'owner', name: '责任人', type: 'person', width: 120 },
          { id: 'status', name: '状态', type: 'status', width: 120 }
        ],
        rows: [
          {
            recordId: 'r2',
            values: ['登录延迟风险', '在发布前完成压测并准备降级方案。', '张三', '跟踪中']
          }
        ]
      }
    ]
  };
}
