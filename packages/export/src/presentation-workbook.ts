import ExcelJS from 'exceljs';
import { calculatePresentationGridLayout } from './layout.js';
import { sanitizeExcelText } from './editable-workbook.js';
import { dataCellBorder, EXCEL_THEME, solidFill, statusColors } from './excel-theme.js';
import {
  isReportSection,
  type ReportBlock,
  type ReportCellValue,
  type ReportField,
  type ReportImageBlock,
  type ReportModel,
  type ReportSection,
  type ReportTextBlock
} from './report.js';

const GRID_COLUMNS = 60;
const TITLE_ROW = 1;
const PERIOD_ROW = 2;
const FIRST_SECTION_ROW = 4;

export type PresentationImage = {
  bytes: Uint8Array;
  mimeType: string;
};

export type PresentationWorkbookOptions = {
  resolveImage?: (assetId: string) => Promise<PresentationImage>;
};

export async function buildPresentationWorkbook(
  model: ReportModel,
  options: PresentationWorkbookOptions = {}
): Promise<Uint8Array> {
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
  const blocks = includedBlocks(model);
  for (const block of blocks) {
    if (isReportSection(block)) {
      nextRow = writePresentationSection(worksheet, block, model, nextRow);
    } else if (block.kind === 'text') {
      nextRow = writeTextBlock(worksheet, block, model, nextRow);
    } else {
      nextRow = await writeImageBlock(workbook, worksheet, block, options, nextRow);
    }
  }
  if (blocks.length === 0) {
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
        bold: field.reportEmphasis === 'strong',
        color: { argb: EXCEL_THEME.color.ink }
      };
      if (rowIndex % 2 === 1) cell.fill = solidFill(EXCEL_THEME.color.stripeFill);
      cell.alignment = alignmentForField(field);
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

function writeTextBlock(
  worksheet: ExcelJS.Worksheet,
  block: ReportTextBlock,
  model: ReportModel,
  startRow: number
): number {
  let nextRow = startRow;
  if (block.title.trim()) {
    writeBlockTitle(worksheet, nextRow, block.title);
    nextRow += 1;
  }
  mergeAndSet(worksheet, nextRow, 1, GRID_COLUMNS, sanitizeExcelText(block.body));
  const body = worksheet.getCell(nextRow, 1);
  body.font = { name: EXCEL_THEME.font, size: 10, color: { argb: EXCEL_THEME.color.ink } };
  body.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  body.border = dataCellBorder();
  const visualLines = Math.max(
    1,
    block.body.split(/\r?\n/).length,
    Math.ceil(block.body.length / 90)
  );
  worksheet.getRow(nextRow).height = Math.min(
    model.density === 'compact' ? 120 : 180,
    Math.max(model.density === 'compact' ? 26 : 34, visualLines * 17)
  );
  return nextRow + 2;
}

async function writeImageBlock(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  block: ReportImageBlock,
  options: PresentationWorkbookOptions,
  startRow: number
): Promise<number> {
  let nextRow = startRow;
  if (block.title?.trim()) {
    writeBlockTitle(worksheet, nextRow, block.title);
    nextRow += 1;
  }
  if (block.asset && options.resolveImage) {
    const image = await options.resolveImage(block.asset.id);
    const extension = excelImageExtension(image.mimeType);
    const dimensions = imageDimensions(image.bytes, image.mimeType) ?? { width: 1200, height: 675 };
    const fitted = fitImage(dimensions, { width: 900, height: 420 });
    const imageId = workbook.addImage({
      base64: Buffer.from(image.bytes).toString('base64'),
      extension
    });
    worksheet.addImage(imageId, {
      tl: { col: 0, row: nextRow - 1 },
      ext: fitted,
      editAs: 'oneCell'
    });
    worksheet.getRow(nextRow).height = fitted.height * 0.75 + 8;
    nextRow += 1;
  } else if (block.asset) {
    mergeAndSet(worksheet, nextRow, 1, GRID_COLUMNS, '图片未包含在当前导出中。');
    const placeholder = worksheet.getCell(nextRow, 1);
    placeholder.font = {
      name: EXCEL_THEME.font,
      size: 10,
      color: { argb: EXCEL_THEME.color.muted }
    };
    placeholder.alignment = { vertical: 'middle', horizontal: 'center' };
    placeholder.border = dataCellBorder();
    worksheet.getRow(nextRow).height = 30;
    nextRow += 1;
  }
  if (block.caption?.trim()) {
    mergeAndSet(worksheet, nextRow, 1, GRID_COLUMNS, sanitizeExcelText(block.caption));
    const caption = worksheet.getCell(nextRow, 1);
    caption.font = {
      name: EXCEL_THEME.font,
      size: 9,
      italic: true,
      color: { argb: EXCEL_THEME.color.muted }
    };
    caption.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    worksheet.getRow(nextRow).height = 24;
    nextRow += 1;
  }
  return nextRow + 1;
}

function writeBlockTitle(worksheet: ExcelJS.Worksheet, row: number, title: string): void {
  mergeAndSet(worksheet, row, 1, GRID_COLUMNS, sanitizeExcelText(title));
  const cell = worksheet.getCell(row, 1);
  cell.font = {
    name: EXCEL_THEME.font,
    size: 12,
    bold: true,
    color: { argb: EXCEL_THEME.color.accentDark }
  };
  cell.fill = solidFill(EXCEL_THEME.color.accentSoft);
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  cell.border = { bottom: { style: 'medium', color: { argb: EXCEL_THEME.color.accent } } };
  worksheet.getRow(row).height = 28;
}

function includedBlocks(model: ReportModel): ReportBlock[] {
  const blocks = model.blocks ?? model.sections;
  return blocks.filter((block) => {
    if (!block.includeInExport) return false;
    if (isReportSection(block)) return model.includeEmptySections || block.rows.length > 0;
    if (block.kind === 'text')
      return model.includeEmptySections || Boolean(block.title.trim() || block.body.trim());
    return (
      model.includeEmptySections ||
      Boolean(block.asset || block.title?.trim() || block.caption?.trim())
    );
  });
}

function excelImageExtension(mimeType: string): 'png' | 'jpeg' | 'gif' {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpeg';
  if (mimeType === 'image/gif') return 'gif';
  throw new Error(`Unsupported presentation image type: ${mimeType}`);
}

function fitImage(
  source: { width: number; height: number },
  bounds: { width: number; height: number }
): { width: number; height: number } {
  const scale = Math.min(1, bounds.width / source.width, bounds.height / source.height);
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale))
  };
}

function imageDimensions(
  bytes: Uint8Array,
  mimeType: string
): { width: number; height: number } | undefined {
  if (mimeType === 'image/png' && bytes.length >= 24) {
    return { width: readUint32Be(bytes, 16), height: readUint32Be(bytes, 20) };
  }
  if (mimeType === 'image/gif' && bytes.length >= 10) {
    return {
      width: bytes[6]! | (bytes[7]! << 8),
      height: bytes[8]! | (bytes[9]! << 8)
    };
  }
  if (mimeType === 'image/jpeg') return jpegDimensions(bytes);
  return undefined;
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1]!;
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2 || offset + length + 2 > bytes.length) return undefined;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)) {
      return {
        height: (bytes[offset + 5]! << 8) | bytes[offset + 6]!,
        width: (bytes[offset + 7]! << 8) | bytes[offset + 8]!
      };
    }
    offset += length + 2;
  }
  return undefined;
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
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

function alignmentForField(field: ReportField): Partial<ExcelJS.Alignment> {
  if (field.reportAlign) {
    return { vertical: 'middle', horizontal: field.reportAlign, wrapText: true };
  }
  if (field.type === 'number') return { vertical: 'middle', horizontal: 'right' };
  if (
    field.type === 'sequence' ||
    field.type === 'checkbox' ||
    field.type === 'date' ||
    field.type === 'status' ||
    field.type === 'single_select' ||
    field.type === 'multi_select' ||
    field.type === 'person'
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
