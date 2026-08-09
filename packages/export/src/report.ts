import { isRecordCompleted, type FieldConfig, type FieldType } from '@project-manager/domain';

export type ReportCellValue = string | number | boolean | string[] | null;

export type ReportField = {
  id: string;
  name: string;
  type: FieldType;
  width: number | undefined;
  reportAlign?: 'left' | 'center' | 'right';
  reportEmphasis?: 'normal' | 'strong';
};

export type ReportSection = {
  kind?: 'table';
  blockId: string;
  title: string;
  description: string | null;
  includeInExport: boolean;
  fields: ReportField[];
  rows: Array<{ recordId: string; values: ReportCellValue[] }>;
};

export type ReportTextBlock = {
  kind: 'text';
  blockId: string;
  title: string;
  body: string;
  includeInExport: boolean;
};

export type ReportImageBlock = {
  kind: 'image';
  blockId: string;
  title: string | null;
  caption: string | null;
  includeInExport: boolean;
  asset: {
    id: string;
    mimeType: string;
    byteLength: number;
    originalFilename: string | null;
    contentUrl: string;
  } | null;
};

export type ReportBlock = ReportSection | ReportTextBlock | ReportImageBlock;

export type ReportModel = {
  version: 1;
  title: string;
  period: string | null;
  density: 'compact' | 'comfortable';
  includeEmptySections: boolean;
  includeCompleted: boolean;
  highlightStatus: boolean;
  blocks?: ReportBlock[];
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

type DashboardTableBlockSource = {
  id: string;
  kind: 'table_view';
  titleOverride: string | null;
  description: string | null;
  includeInExport: boolean;
  view: {
    database: { name: string };
    view: {
      name: string;
      config: {
        visibleFieldIds: string[];
        fieldWidths: Record<string, number>;
        fieldPresentation?: Record<
          string,
          {
            reportAlign?: 'left' | 'center' | 'right';
            reportEmphasis?: 'normal' | 'strong';
          }
        >;
      };
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
};

type DashboardTextBlockSource = {
  id: string;
  kind: 'text';
  includeInExport: boolean;
  config: { version: 1; title: string; body: string };
};

type DashboardImageBlockSource = {
  id: string;
  kind: 'image';
  includeInExport: boolean;
  config: { version: 1; title: string | null; caption: string | null };
  asset: ReportImageBlock['asset'];
};

export type DashboardReportSource = {
  dashboard: { name: string };
  blocks: Array<DashboardTableBlockSource | DashboardTextBlockSource | DashboardImageBlockSource>;
};

export function buildReportModel(
  source: DashboardReportSource,
  options?: ReportBuildOptions
): ReportModel {
  const blocks = source.blocks.map((block): ReportBlock => {
    if (block.kind === 'text') {
      return {
        kind: 'text',
        blockId: block.id,
        title: block.config.title,
        body: block.config.body,
        includeInExport: block.includeInExport
      };
    }
    if (block.kind === 'image') {
      return {
        kind: 'image',
        blockId: block.id,
        title: block.config.title,
        caption: block.config.caption,
        includeInExport: block.includeInExport,
        asset: block.asset
      };
    }
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
        width: block.view.view.config.fieldWidths[field.id],
        ...block.view.view.config.fieldPresentation?.[field.id]
      }));
    return {
      kind: 'table',
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
              field.type === 'sequence' ? record.sequenceNumber : (record.values[field.id] ?? null)
            );
          })
        }))
    };
  });
  return {
    version: 1,
    title: options?.title?.trim() || source.dashboard.name,
    period: options?.period ?? null,
    density: options?.density ?? 'comfortable',
    includeEmptySections: options?.includeEmptySections ?? false,
    includeCompleted: options?.includeCompleted ?? true,
    highlightStatus: options?.highlightStatus ?? true,
    blocks,
    sections: blocks.filter(isReportSection)
  };
}

function displayFieldValue(
  field: DashboardTableBlockSource['view']['fields'][number],
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

export function isReportSection(block: ReportBlock): block is ReportSection {
  return block.kind === undefined || block.kind === 'table';
}

export function renderReportHtml(model: ReportModel): string {
  return renderOutlookDocument(model);
}

function renderOutlookDocument(model: ReportModel): string {
  const cellPadding = model.density === 'compact' ? '5px 7px' : '9px 10px';
  const blocks = includedReportBlocks(model)
    .map((block) => {
      if (isReportSection(block)) return renderTableBlock(block, model, cellPadding);
      if (block.kind === 'text') {
        return `<section style="margin:0 0 24px 0">${block.title.trim() ? `<h2 style="margin:0 0 8px 0;font-size:18px;color:#24324a">${escapeHtml(block.title)}</h2>` : ''}<div style="margin:0;color:#263244;line-height:1.65;white-space:pre-wrap">${escapeHtml(block.body)}</div></section>`;
      }
      return `<section style="margin:0 0 24px 0;text-align:center">${block.title?.trim() ? `<h2 style="margin:0 0 8px 0;font-size:18px;color:#24324a;text-align:left">${escapeHtml(block.title)}</h2>` : ''}${block.asset ? `<img src="${escapeHtml(block.asset.contentUrl)}" alt="${escapeHtml(block.title || block.caption || block.asset.originalFilename || '页面图片')}" style="display:block;max-width:100%;height:auto;margin:0 auto;border:0">` : ''}${block.caption?.trim() ? `<p style="margin:8px 0 0;color:#657084;font-size:12px">${escapeHtml(block.caption)}</p>` : ''}</section>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>${escapeHtml(model.title)}</title></head><body style="margin:0;padding:28px;background:#ffffff;color:#263244;font-family:'Segoe UI','Microsoft YaHei',Arial,sans-serif"><main style="max-width:1100px;margin:0 auto"><h1 style="margin:0 0 6px 0;font-size:26px;color:#17233c">${escapeHtml(model.title)}</h1>${model.period ? `<p style="margin:0 0 24px 0;color:#657084">${escapeHtml(model.period)}</p>` : ''}${blocks || '<p style="margin:0;color:#5f6b7c">没有符合当前导出条件的记录。</p>'}</main></body></html>`;
}

function includedReportBlocks(model: ReportModel): ReportBlock[] {
  return (model.blocks ?? model.sections).filter((block) => {
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

function renderTableBlock(section: ReportSection, model: ReportModel, cellPadding: string): string {
  return `<section style="margin:0 0 24px 0"><h2 style="margin:0 0 8px 0;font-size:18px;color:#24324a">${escapeHtml(section.title)}</h2>${section.description ? `<p style="margin:0 0 10px 0;color:#5f6b7c">${escapeHtml(section.description)}</p>` : ''}<table role="table" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;table-layout:fixed"><thead><tr>${section.fields.map((field) => `<th style="${field.width ? `width:${field.width}px;` : ''}padding:${cellPadding};border:1px solid #000000;background:#eef2f7;color:#344054;text-align:center;font-size:12px">${escapeHtml(field.name)}</th>`).join('')}</tr></thead><tbody>${section.rows.map((row) => `<tr>${row.values.map((value, index) => `<td style="padding:${cellPadding};border:1px solid #000000;vertical-align:middle;overflow-wrap:anywhere;${horizontalStyle(section.fields[index])}${section.fields[index]?.reportEmphasis === 'strong' ? 'font-weight:700;' : ''}${model.highlightStatus && section.fields[index]?.type === 'status' && displayValue(value) ? 'background:#edf4ff;color:#315fce;font-weight:600;' : ''}">${escapeHtml(displayValue(value))}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
}

function horizontalStyle(field: ReportField | undefined): string {
  const centerTypes: FieldType[] = [
    'sequence',
    'checkbox',
    'date',
    'status',
    'single_select',
    'person'
  ];
  const alignment =
    field?.reportAlign ?? (field && centerTypes.includes(field.type) ? 'center' : 'left');
  return `text-align:${alignment};`;
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
