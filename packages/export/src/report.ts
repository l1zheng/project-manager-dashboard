export type ReportCellValue = string | number | boolean | string[] | null;

export type ReportField = {
  id: string;
  name: string;
  type: string;
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
  sections: ReportSection[];
};

export type DashboardReportSource = {
  dashboard: { name: string };
  blocks: Array<{
    id: string;
    titleOverride: string | null;
    description: string | null;
    includeInExport: boolean;
    view: {
      view: {
        name: string;
        config: { visibleFieldIds: string[]; fieldWidths: Record<string, number> };
      };
      fields: Array<{ id: string; name: string; type: string }>;
      records: Array<{ id: string; values: Record<string, ReportCellValue> }>;
    };
  }>;
};

export function buildReportModel(
  source: DashboardReportSource,
  options?: { title?: string; period?: string | null }
): ReportModel {
  return {
    version: 1,
    title: options?.title?.trim() || source.dashboard.name,
    period: options?.period ?? null,
    sections: source.blocks.map((block) => {
      const fields = block.view.view.config.visibleFieldIds
        .map((id) => block.view.fields.find((field) => field.id === id))
        .filter((field): field is { id: string; name: string; type: string } => field !== undefined)
        .map((field) => ({
          id: field.id,
          name: field.name,
          type: field.type,
          width: block.view.view.config.fieldWidths[field.id]
        }));
      return {
        blockId: block.id,
        title: block.titleOverride ?? block.view.view.name,
        description: block.description,
        includeInExport: block.includeInExport,
        fields,
        rows: block.view.records.map((record) => ({
          recordId: record.id,
          values: fields.map((field) => record.values[field.id] ?? null)
        }))
      };
    })
  };
}

export function renderReportHtml(model: ReportModel): string {
  const sections = model.sections
    .filter((section) => section.includeInExport)
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.title)}</h2>${section.description ? `<p>${escapeHtml(section.description)}</p>` : ''}<table border="1" cellspacing="0" cellpadding="6"><thead><tr>${section.fields.map((field) => `<th>${escapeHtml(field.name)}</th>`).join('')}</tr></thead><tbody>${section.rows.map((row) => `<tr>${row.values.map((value) => `<td>${escapeHtml(displayValue(value))}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><h1>${escapeHtml(model.title)}</h1>${model.period ? `<p>${escapeHtml(model.period)}</p>` : ''}${sections}</body></html>`;
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
