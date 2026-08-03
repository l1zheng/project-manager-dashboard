import ExcelJS from 'exceljs';
import type { FieldType } from '@project-manager/domain';
import type { ReportCellValue, ReportField, ReportModel, ReportSection } from './report.js';

export async function buildEditableWorkbook(model: ReportModel): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Project Manager Dashboard';
  workbook.created = new Date();
  workbook.modified = new Date();

  const usedSheetNames = new Set<string>();
  const sections = model.sections.filter(
    (section) => section.includeInExport && (model.includeEmptySections || section.rows.length > 0)
  );
  for (const section of sections) {
    writeEditableSection(workbook, section, uniqueWorksheetName(section.title, usedSheetNames));
  }

  if (sections.length === 0) {
    const worksheet = workbook.addWorksheet(uniqueWorksheetName('无导出数据', usedSheetNames));
    worksheet.addRow(['没有符合当前导出条件的记录。']);
    styleEmptyWorksheet(worksheet);
  }

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function writeEditableSection(
  workbook: ExcelJS.Workbook,
  section: ReportSection,
  worksheetName: string
): void {
  const worksheet = workbook.addWorksheet(worksheetName, {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }]
  });
  worksheet.properties.defaultRowHeight = 22;
  worksheet.columns = section.fields.map((field) => ({
    key: field.id,
    width: excelColumnWidth(field),
    style: {
      alignment: alignmentForField(field.type)
    }
  }));

  const headerRow = worksheet.addRow(section.fields.map((field) => field.name));
  headerRow.height = 28;
  styleHeaderRow(headerRow);

  for (const reportRow of section.rows) {
    const row = worksheet.addRow(
      reportRow.values.map((value, index) => toEditableCell(section.fields[index]!, value))
    );
    row.height = section.fields.some((field) => field.type === 'long_text') ? 36 : 22;
    styleDataRow(row, section.fields);
  }

  if (section.fields.length > 0) {
    const lastColumn = columnLetter(section.fields.length);
    worksheet.autoFilter = `A1:${lastColumn}${Math.max(1, worksheet.rowCount)}`;
  }
  worksheet.pageSetup = {
    orientation: section.fields.length > 5 ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0
  };
}

function styleEmptyWorksheet(worksheet: ExcelJS.Worksheet): void {
  worksheet.properties.defaultRowHeight = 24;
  worksheet.getColumn(1).width = 36;
  worksheet.getRow(1).font = { name: 'Microsoft YaHei', size: 11, color: { argb: 'FF5F6B7C' } };
  worksheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };
  worksheet.views = [{ showGridLines: false }];
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF315FCE' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF274EA7' } },
      left: { style: 'thin', color: { argb: 'FF274EA7' } },
      bottom: { style: 'thin', color: { argb: 'FF274EA7' } },
      right: { style: 'thin', color: { argb: 'FF274EA7' } }
    };
  });
}

function styleDataRow(row: ExcelJS.Row, fields: ReportField[]): void {
  row.eachCell((cell, columnNumber) => {
    const field = fields[columnNumber - 1]!;
    cell.font = { name: 'Microsoft YaHei', size: 10, color: { argb: 'FF263244' } };
    cell.alignment = alignmentForField(field.type);
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFE2E6EC' } }
    };
    if (field.type === 'date' && cell.value instanceof Date) cell.numFmt = 'yyyy-mm-dd';
    if (field.type === 'number' || field.type === 'sequence') cell.numFmt = '#,##0.########';
  });
}

function toEditableCell(
  field: ReportField,
  value: ReportCellValue
): string | number | boolean | Date | null {
  if (value === null) return null;
  if (field.type === 'date' && typeof value === 'string')
    return parseDateValue(value) ?? sanitizeExcelText(value);
  if (field.type === 'number' || field.type === 'sequence') {
    return typeof value === 'number' ? value : sanitizeExcelText(String(value));
  }
  if (field.type === 'checkbox')
    return typeof value === 'boolean' ? value : sanitizeExcelText(String(value));
  return sanitizeExcelText(Array.isArray(value) ? value.join(', ') : String(value));
}

function parseDateValue(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : undefined;
}

export function sanitizeExcelText(value: string): string {
  const safeValue = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 0x20 || codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d;
    })
    .join('');
  return /^[=+\-@]/.test(safeValue) ? `'${safeValue}` : safeValue;
}

function excelColumnWidth(field: ReportField): number {
  if (field.width !== undefined) return clamp(field.width / 7, 8, 60);
  return {
    sequence: 10,
    checkbox: 10,
    number: 14,
    date: 14,
    single_select: 16,
    multi_select: 22,
    status: 16,
    person: 16,
    short_text: 24,
    long_text: 42,
    url: 32
  }[field.type];
}

function alignmentForField(type: FieldType): Partial<ExcelJS.Alignment> {
  if (type === 'number' || type === 'sequence') return { vertical: 'middle', horizontal: 'right' };
  if (type === 'checkbox') return { vertical: 'middle', horizontal: 'center' };
  if (type === 'date' || type === 'status' || type === 'single_select') {
    return { vertical: 'middle', horizontal: 'center', wrapText: true };
  }
  return { vertical: 'middle', horizontal: 'left', wrapText: true };
}

function uniqueWorksheetName(title: string, usedNames: Set<string>): string {
  const baseName =
    Array.from(title)
      .map((character) => ('\\/*?:[]'.includes(character) ? ' ' : character))
      .join('')
      .trim()
      .replace(/^'+|'+$/g, '') || '数据';
  let candidate = baseName.slice(0, 31);
  let suffix = 2;
  while (usedNames.has(candidate.toLocaleLowerCase())) {
    const suffixText = ` (${suffix})`;
    candidate = `${baseName.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLocaleLowerCase());
  return candidate;
}

function columnLetter(columnNumber: number): string {
  let value = columnNumber;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
