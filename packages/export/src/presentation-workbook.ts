import ExcelJS from 'exceljs';
import type { FieldType } from '@project-manager/domain';
import { calculatePresentationGridLayout } from './layout.js';
import { sanitizeExcelText } from './editable-workbook.js';
import { dataCellBorder, EXCEL_THEME, solidFill, statusColors } from './excel-theme.js';
import type { ReportCellValue, ReportField, ReportModel, ReportSection } from './report.js';

const GRID_COLUMNS = 60;
const TITLE_ROW = 1;
const PERIOD_ROW = 2;
const FIRST_SECTION_ROW = 4;

export async function buildPresentationWorkbook(model: ReportModel): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Project Manager Dashboard';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('项目周报', {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: false, zoomScale: 90 }],
    properties: { tabColor: { argb: EXCEL_THEME.color.accent } }
  });
  worksheet.properties.defaultRowHeight = model.density === 'compact' ? 20 : 24;
  worksheet.columns = Array.from({ length: GRID_COLUMNS }, () => ({ width: 2.35 }));
  worksheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 }
  };
  worksheet.pageSetup.printArea = `A1:${columnLetter(GRID_COLUMNS)}${Math.max(FIRST_SECTION_ROW, estimateLastRow(model))}`;

  writeReportHeading(worksheet, model);
  let nextRow = FIRST_SECTION_ROW;
  const sections = model.sections.filter(
    (section) => section.includeInExport && (model.includeEmptySections || section.rows.length > 0)
  );
  for (const section of sections) {
    nextRow = writePresentationSection(worksheet, section, model, nextRow);
  }
  if (sections.length === 0) {
    mergeAndSet(worksheet, FIRST_SECTION_ROW, 1, GRID_COLUMNS, '没有符合当前导出条件的记录。');
    const cell = worksheet.getCell(FIRST_SECTION_ROW, 1);
    cell.font = {
      name: EXCEL_THEME.font,
      size: 11,
      color: { argb: EXCEL_THEME.color.muted }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(FIRST_SECTION_ROW).height = 30;
  }
  worksheet.pageSetup.printArea = `A1:${columnLetter(GRID_COLUMNS)}${Math.max(nextRow - 1, FIRST_SECTION_ROW)}`;
  worksheet.pageSetup.printTitlesRow = `${TITLE_ROW}:${PERIOD_ROW}`;

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function writeReportHeading(worksheet: ExcelJS.Worksheet, model: ReportModel): void {
  mergeAndSet(worksheet, TITLE_ROW, 1, GRID_COLUMNS, sanitizeExcelText(model.title));
  const title = worksheet.getCell(TITLE_ROW, 1);
  title.font = {
    name: EXCEL_THEME.font,
    size: 20,
    bold: true,
    color: { argb: EXCEL_THEME.color.inkStrong }
  };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(TITLE_ROW).height = 34;

  mergeAndSet(
    worksheet,
    PERIOD_ROW,
    1,
    GRID_COLUMNS,
    model.period ? sanitizeExcelText(model.period) : null
  );
  const period = worksheet.getCell(PERIOD_ROW, 1);
  period.font = {
    name: EXCEL_THEME.font,
    size: 10,
    color: { argb: EXCEL_THEME.color.muted }
  };
  period.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(PERIOD_ROW).height = 22;
}

function writePresentationSection(
  worksheet: ExcelJS.Worksheet,
  section: ReportSection,
  model: ReportModel,
  startRow: number
): number {
  mergeAndSet(worksheet, startRow, 1, GRID_COLUMNS, sanitizeExcelText(section.title));
  const sectionTitle = worksheet.getCell(startRow, 1);
  sectionTitle.font = {
    name: EXCEL_THEME.font,
    size: 12,
    bold: true,
    color: { argb: EXCEL_THEME.color.accentDark }
  };
  sectionTitle.fill = solidFill(EXCEL_THEME.color.accentSoft);
  sectionTitle.alignment = { vertical: 'middle', horizontal: 'left' };
  sectionTitle.border = {
    bottom: { style: 'medium', color: { argb: EXCEL_THEME.color.accent } }
  };
  worksheet.getRow(startRow).height = 28;
  let nextRow = startRow + 1;

  if (section.description) {
    mergeAndSet(worksheet, nextRow, 1, GRID_COLUMNS, sanitizeExcelText(section.description));
    const description = worksheet.getCell(nextRow, 1);
    description.font = {
      name: EXCEL_THEME.font,
      size: 10,
      italic: true,
      color: { argb: EXCEL_THEME.color.muted }
    };
    description.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    worksheet.getRow(nextRow).height = 28;
    nextRow += 1;
  }

  if (section.fields.length === 0) return nextRow + 1;
  const layout = calculatePresentationGridLayout(
    section.fields.map((field, index) => ({
      ...field,
      sampleValues: section.rows.slice(0, 50).map((row) => row.values[index]!)
    })),
    GRID_COLUMNS
  );
  for (const fieldLayout of layout.fields) {
    const field = section.fields.find((candidate) => candidate.id === fieldLayout.fieldId)!;
    mergeAndSet(worksheet, nextRow, fieldLayout.startColumn, fieldLayout.endColumn, field.name);
    const cell = worksheet.getCell(nextRow, fieldLayout.startColumn);
    cell.font = {
      name: EXCEL_THEME.font,
      size: 10,
      bold: true,
      color: { argb: EXCEL_THEME.color.accentDark }
    };
    cell.fill = solidFill(EXCEL_THEME.color.headerFill);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: EXCEL_THEME.color.tableBorder } },
      left: { style: 'thin', color: { argb: EXCEL_THEME.color.tableBorder } },
      bottom: { style: 'thin', color: { argb: EXCEL_THEME.color.tableBorder } },
      right: { style: 'thin', color: { argb: EXCEL_THEME.color.tableBorder } }
    };
  }
  worksheet.getRow(nextRow).height = 28;
  nextRow += 1;

  for (const [rowIndex, reportRow] of section.rows.entries()) {
    for (const fieldLayout of layout.fields) {
      const fieldIndex = section.fields.findIndex((field) => field.id === fieldLayout.fieldId);
      const field = section.fields[fieldIndex]!;
      const value = reportRow.values[fieldIndex]!;
      mergeAndSet(
        worksheet,
        nextRow,
        fieldLayout.startColumn,
        fieldLayout.endColumn,
        toPresentationCell(field, value)
      );
      const cell = worksheet.getCell(nextRow, fieldLayout.startColumn);
      cell.font = {
        name: EXCEL_THEME.font,
        size: 10,
        color: { argb: EXCEL_THEME.color.ink }
      };
      if (rowIndex % 2 === 1) cell.fill = solidFill(EXCEL_THEME.color.stripeFill);
      cell.alignment = alignmentForField(field.type);
      cell.border = dataCellBorder();
      if (field.type === 'date' && cell.value instanceof Date) cell.numFmt = 'yyyy-mm-dd';
      if (field.type === 'number') cell.numFmt = '#,##0.########';
      if (field.type === 'sequence') cell.numFmt = '0';
      if (model.highlightStatus && field.type === 'status' && value !== null && value !== '') {
        const colors = statusColors(value);
        cell.fill = solidFill(colors.fill);
        cell.font = {
          name: EXCEL_THEME.font,
          size: 10,
          bold: true,
          color: { argb: colors.text }
        };
      }
    }
    worksheet.getRow(nextRow).height = rowHeightForSection(section, model.density);
    nextRow += 1;
  }
  return nextRow + 1;
}

function mergeAndSet(
  worksheet: ExcelJS.Worksheet,
  row: number,
  startColumn: number,
  endColumn: number,
  value: string | number | boolean | Date | null
): void {
  if (endColumn > startColumn) worksheet.mergeCells(row, startColumn, row, endColumn);
  worksheet.getCell(row, startColumn).value = value;
}

function toPresentationCell(
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

function alignmentForField(type: FieldType): Partial<ExcelJS.Alignment> {
  if (type === 'number') return { vertical: 'middle', horizontal: 'right' };
  if (
    type === 'sequence' ||
    type === 'checkbox' ||
    type === 'date' ||
    type === 'status' ||
    type === 'single_select' ||
    type === 'person'
  ) {
    return { vertical: 'middle', horizontal: 'center', wrapText: true };
  }
  return { vertical: 'middle', horizontal: 'left', wrapText: true };
}

function rowHeightForSection(section: ReportSection, density: ReportModel['density']): number {
  const hasLongText = section.fields.some((field) => field.type === 'long_text');
  if (hasLongText) return density === 'compact' ? 40 : 54;
  return density === 'compact' ? 24 : 30;
}

function estimateLastRow(model: ReportModel): number {
  return (
    FIRST_SECTION_ROW +
    model.sections.reduce(
      (total, section) => total + 3 + section.rows.length + (section.description ? 1 : 0),
      0
    )
  );
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
