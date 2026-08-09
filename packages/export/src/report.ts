import { isRecordCompleted, type FieldConfig, type FieldType } from '@project-manager/domain';

export type ReportCellValue = string | number | boolean | string[] | null;

export type ReportField = {
  id: string;
  name: string;
  type: FieldType;
  width: number | undefined;
};

export type ReportSection = {
  blockId: string;
  title: string;
  description: string | null;
  includeInExport: boolean;
  fields: ReportField[];
  rows: Array<{ recordId: string; values: ReportCellValue[] }>;
};

export type ReportModel = {
  version: 1;
  title: string;
  period: string | null;
  density: 'compact' | 'comfortable';
  includeEmptySections: boolean;
  includeCompleted: boolean;
  highlightStatus: boolean;
  sections: ReportSection[];
};

export type ReportBuildOptions = {
  title?: string;
  period?: string | null;
  density?: 'compact' | 'comfortable';
  includeEmptySections?: boolean;
  includeCompleted?: boolean;
  highlightStatus?: boolean;
};

export type DashboardReportSource = {
  dashboard: { name: string };
  blocks: Array<{
    id: string;
    titleOverride: string | null;
    description: string | null;
    includeInExport: boolean;
    view: {
      database: { name: string };
      view: {
        name: string;
        config: { visibleFieldIds: string[]; fieldWidths: Record<string, number> };
      };
      fields: Array<{
        id: string;
        name: string;
        type: FieldType;
        config: FieldConfig;
      }>;
      records: Array<{
        id: string;
        sequenceNumber: number;
        values: Record<string, ReportCellValue>;
      }>;
    };
  }>;
};

export function buildReportModel(
  source: DashboardReportSource,
  options?: ReportBuildOptions
): ReportModel {
  return {
    version: 1,
    title: options?.title?.trim() || source.dashboard.name,
    period: options?.period ?? null,
    density: options?.density ?? 'comfortable',
    includeEmptySections: options?.includeEmptySections ?? false,
    includeCompleted: options?.includeCompleted ?? true,
    highlightStatus: options?.highlightStatus ?? true,
    sections: source.blocks.map((block) => {
      const fields = block.view.view.config.visibleFieldIds
        .map((id) => block.view.fields.find((field) => field.id === id))
        .filter(
          (
            field
          ): field is {
            id: string;
            name: string;
            type: FieldType;
            config: FieldConfig;
          } => field !== undefined
        )
        .map((field) => ({
          id: field.id,
          name: field.name,
          type: field.type,
          width: block.view.view.config.fieldWidths[field.id]
        }));
      return {
        blockId: block.id,
        title: block.titleOverride ?? block.view.database.name,
        description: block.description,
        includeInExport: block.includeInExport,
        fields,
        rows: block.view.records
          .filter(
            (record) =>
              (options?.includeCompleted ?? true) ||
              !isRecordCompleted(block.view.fields, record.values)
          )
          .map((record) => ({
            recordId: record.id,
            values: fields.map((field) => {
              const sourceField = block.view.fields.find((candidate) => candidate.id === field.id)!;
              return displayFieldValue(
                sourceField,
                field.type === 'sequence'
                  ? record.sequenceNumber
                  : (record.values[field.id] ?? null)
              );
            })
          }))
      };
    })
  };
}

function displayFieldValue(
  field: DashboardReportSource['blocks'][number]['view']['fields'][number],
  value: ReportCellValue
): ReportCellValue {
  const optionLabels = new Map(field.config.options?.map((option) => [option.id, option.label]));
  if (field.type === 'single_select' || field.type === 'status') {
    return typeof value === 'string' ? (optionLabels.get(value) ?? value) : value;
  }
  if (field.type === 'multi_select' && Array.isArray(value)) {
    return value.map((optionId) => optionLabels.get(optionId) ?? optionId);
  }
  return value;
}

export function renderReportHtml(model: ReportModel): string {
  return renderOutlookDocument(model);
}

function renderOutlookDocument(model: ReportModel): string {
  const cellPadding = model.density === 'compact' ? '5px 7px' : '9px 10px';
  const sections = model.sections
    .filter(
      (section) =>
        section.includeInExport && (model.includeEmptySections || section.rows.length > 0)
    )
    .map(
      (section) =>
        `<section style="margin:0 0 24px 0"><h2 style="margin:0 0 8px 0;font-size:18px;color:#24324a">${escapeHtml(section.title)}</h2>${section.description ? `<p style="margin:0 0 10px 0;color:#5f6b7c">${escapeHtml(section.description)}</p>` : ''}<table role="table" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;table-layout:fixed"><thead><tr>${section.fields.map((field) => `<th style="${field.width ? `width:${field.width}px;` : ''}padding:${cellPadding};border:1px solid #cfd7e3;background:#eef2f7;color:#344054;text-align:left;font-size:12px">${escapeHtml(field.name)}</th>`).join('')}</tr></thead><tbody>${section.rows.map((row) => `<tr>${row.values.map((value, index) => `<td style="padding:${cellPadding};border:1px solid #d9dfe8;vertical-align:top;overflow-wrap:anywhere;${model.highlightStatus && section.fields[index]?.type === 'status' && displayValue(value) ? 'background:#edf4ff;color:#315fce;font-weight:600;' : ''}">${escapeHtml(displayValue(value))}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>${escapeHtml(model.title)}</title></head><body style="margin:0;padding:28px;background:#ffffff;color:#263244;font-family:'Segoe UI','Microsoft YaHei',Arial,sans-serif"><main style="max-width:1100px;margin:0 auto"><h1 style="margin:0 0 6px 0;font-size:26px;color:#17233c">${escapeHtml(model.title)}</h1>${model.period ? `<p style="margin:0 0 24px 0;color:#657084">${escapeHtml(model.period)}</p>` : ''}${sections}</main></body></html>`;
}

function displayValue(value: ReportCellValue): string {
  return Array.isArray(value) ? value.join(', ') : value === null ? '' : String(value);
}
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!
  );
}
