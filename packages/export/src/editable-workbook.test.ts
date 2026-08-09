import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildEditableWorkbook, sanitizeExcelText } from './editable-workbook.js';
import type { ReportModel } from './report.js';

describe('editable Excel workbook', () => {
  it('creates typed, filtered, frozen worksheets without merged data cells', async () => {
    const model: ReportModel = {
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
            { id: 'name', name: '需求名称', type: 'short_text', width: 220 },
            { id: 'plan', name: '交付计划', type: 'date', width: 120 },
            { id: 'status', name: '状态', type: 'status', width: 120 },
            { id: 'effort', name: '工作量', type: 'number', width: 100 }
          ],
          rows: [
            {
              recordId: 'r1',
              values: [1, '=HYPERLINK("https://unsafe.example")', '2026-08-14', '进行中', 3.5]
            }
          ]
        },
        {
          blockId: 'empty',
          title: '空模块',
          description: null,
          includeInExport: true,
          fields: [{ id: 'title', name: '事项', type: 'short_text', width: 200 }],
          rows: []
        }
      ]
    };

    const buffer = await buildEditableWorkbook(model);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual(['需求跟踪']);
    const worksheet = workbook.getWorksheet('需求跟踪')!;
    expect(worksheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(worksheet.autoFilter).toBeDefined();
    expect(worksheet.model.merges).toEqual([]);
    expect((worksheet.getRow(1).values as unknown[]).slice(1)).toEqual([
      '序号',
      '需求名称',
      '交付计划',
      '状态',
      '工作量'
    ]);
    expect(worksheet.getCell('A2').value).toBe(1);
    expect(worksheet.getCell('A2').numFmt).toBe('0');
    expect(worksheet.getCell('A2').alignment.horizontal).toBe('center');
    expect(worksheet.getCell('B2').value).toBe(`'=HYPERLINK("https://unsafe.example")`);
    expect(worksheet.getCell('C2').value).toBeInstanceOf(Date);
    expect((worksheet.getCell('C2').value as Date).toISOString().slice(0, 10)).toBe('2026-08-14');
    expect(worksheet.getCell('C2').numFmt).toBe('yyyy-mm-dd');
    expect(worksheet.getCell('E2').value).toBe(3.5);
    expect(worksheet.views[0]?.showGridLines).toBe(false);
    expect(worksheet.getCell('A1').fill).toMatchObject({
      fgColor: { argb: 'FF355E7A' }
    });
    expect(worksheet.getCell('A1').border.top).toBeUndefined();
    expect(worksheet.getCell('A1').border.bottom?.style).toBe('medium');
    expect(worksheet.getCell('D2').fill).toMatchObject({
      fgColor: { argb: 'FFE8F1FB' }
    });
  });

  it('creates an explanatory worksheet when nothing is exportable', async () => {
    const buffer = await buildEditableWorkbook({
      version: 1,
      title: '空周报',
      period: null,
      density: 'compact',
      includeEmptySections: false,
      includeCompleted: false,
      highlightStatus: false,
      sections: []
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    expect(workbook.worksheets).toHaveLength(1);
    expect(workbook.worksheets[0]!.getCell('A1').value).toContain('没有符合');
  });

  it('keeps an empty database as a header-only worksheet when requested', async () => {
    const buffer = await buildEditableWorkbook({
      version: 1,
      title: '完整工作台',
      period: null,
      density: 'comfortable',
      includeEmptySections: true,
      includeCompleted: true,
      highlightStatus: true,
      sections: [
        {
          blockId: 'risks',
          title: '关键风险',
          description: null,
          includeInExport: true,
          fields: [
            { id: 'risk', name: '风险描述', type: 'short_text', width: 220 },
            { id: 'mitigation', name: '风险消减措施', type: 'long_text', width: 320 }
          ],
          rows: []
        }
      ]
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual(['关键风险']);
    expect((workbook.worksheets[0]!.getRow(1).values as unknown[]).slice(1)).toEqual([
      '风险描述',
      '风险消减措施'
    ]);
  });

  it('neutralizes formula-like text and invalid XML control characters', () => {
    expect(sanitizeExcelText('=1+1')).toBe("'=1+1");
    expect(sanitizeExcelText('@cmd')).toBe("'@cmd");
    expect(sanitizeExcelText('正常\u0000文本')).toBe('正常文本');
  });
});
