import type {
  ReportBlock,
  ReportCellValue,
  ReportImageBlock,
  ReportModel,
  ReportSection
} from './report.js';
import { escapeHtml, isReportSection } from './report.js';

export type OutlookReport = {
  subject: string;
  htmlFragment: string;
  htmlDocument: string;
  plainText: string;
};

export type OutlookRenderOptions = {
  imageSource?: (image: ReportImageBlock) => string | undefined;
};

export function renderOutlookReport(
  model: ReportModel,
  options: OutlookRenderOptions = {}
): OutlookReport {
  const htmlFragment = renderOutlookFragment(model, options);
  return {
    subject: normalizeMailSubject(model.title),
    htmlFragment,
    htmlDocument: `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>${escapeHtml(normalizeMailSubject(model.title))}</title></head><body style="margin:0;padding:28px;background:#ffffff;color:#263244;font-family:'Segoe UI','Microsoft YaHei',Arial,sans-serif">${htmlFragment}</body></html>`,
    plainText: renderOutlookPlainText(model)
  };
}

export function normalizeMailSubject(value: string): string {
  const normalized = Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f ? ' ' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(normalized || '项目周报')
    .slice(0, 120)
    .join('');
}

function renderOutlookFragment(model: ReportModel, options: OutlookRenderOptions): string {
  const cellPadding = model.density === 'compact' ? '5px 7px' : '9px 10px';
  const blocks = includedBlocks(model)
    .map((block) => renderBlock(block, model, cellPadding, options))
    .join('');
  return `<main style="max-width:1100px;margin:0 auto"><h1 style="margin:0 0 6px 0;font-size:26px;color:#17233c">${escapeHtml(model.title)}</h1>${model.period ? `<p style="margin:0 0 24px 0;color:#657084">${escapeHtml(model.period)}</p>` : ''}${blocks || '<p style="margin:0;color:#5f6b7c">没有符合当前导出条件的记录。</p>'}</main>`;
}

function renderBlock(
  block: ReportBlock,
  model: ReportModel,
  cellPadding: string,
  options: OutlookRenderOptions
): string {
  if (isReportSection(block)) return renderSection(block, model, cellPadding);
  if (block.kind === 'text') {
    return `<section style="margin:0 0 24px 0">${block.title.trim() ? `<h2 style="margin:0 0 8px 0;font-size:18px;color:#24324a">${escapeHtml(block.title)}</h2>` : ''}<div style="margin:0;color:#263244;line-height:1.65">${escapeHtml(block.body).replace(/\r?\n/g, '<br>')}</div></section>`;
  }
  const source = options.imageSource?.(block);
  return `<section style="margin:0 0 24px 0;text-align:center">${block.title?.trim() ? `<h2 style="margin:0 0 8px 0;font-size:18px;color:#24324a;text-align:left">${escapeHtml(block.title)}</h2>` : ''}${block.asset && source ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(block.title || block.caption || block.asset.originalFilename || '页面图片')}" style="display:block;max-width:100%;height:auto;margin:0 auto;border:0">` : ''}${block.caption?.trim() ? `<p style="margin:8px 0 0;color:#657084;font-size:12px">${escapeHtml(block.caption)}</p>` : ''}</section>`;
}

function renderSection(section: ReportSection, model: ReportModel, cellPadding: string): string {
  const headers = section.fields
    .map(
      (field) =>
        `<th style="${field.width ? `width:${field.width}px;` : ''}padding:${cellPadding};border:1px solid #000000;background:#eef2f7;color:#344054;text-align:center;font-size:12px">${escapeHtml(field.name)}</th>`
    )
    .join('');
  const rows = section.rows
    .map(
      (row) =>
        `<tr>${row.values
          .map((value, index) => {
            const isStatus = model.highlightStatus && section.fields[index]?.type === 'status';
            const display = displayValue(value);
            const field = section.fields[index];
            const centered =
              field?.reportAlign === 'center' ||
              (!field?.reportAlign &&
                ['sequence', 'checkbox', 'date', 'status', 'single_select', 'person'].includes(
                  field?.type ?? ''
                ));
            return `<td style="padding:${cellPadding};border:1px solid #000000;vertical-align:middle;overflow-wrap:anywhere;text-align:${centered ? 'center' : (field?.reportAlign ?? 'left')};${field?.reportEmphasis === 'strong' ? 'font-weight:700;' : ''}${isStatus && display ? 'background:#edf4ff;color:#315fce;font-weight:600;' : ''}">${escapeHtml(display)}</td>`;
          })
          .join('')}</tr>`
    )
    .join('');
  return `<section style="margin:0 0 24px 0"><h2 style="margin:0 0 8px 0;font-size:18px;color:#24324a">${escapeHtml(section.title)}</h2>${section.description ? `<p style="margin:0 0 10px 0;color:#5f6b7c">${escapeHtml(section.description)}</p>` : ''}<table role="table" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;table-layout:fixed"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></section>`;
}

function renderOutlookPlainText(model: ReportModel): string {
  const lines = [normalizeMailSubject(model.title)];
  if (model.period) lines.push(model.period);
  for (const block of includedBlocks(model)) {
    if (isReportSection(block)) {
      lines.push('', block.title);
      if (block.description) lines.push(block.description);
      lines.push(block.fields.map((field) => field.name).join('\t'));
      for (const row of block.rows) lines.push(row.values.map(displayValue).join('\t'));
    } else if (block.kind === 'text') {
      if (block.title.trim()) lines.push('', block.title);
      if (block.body.trim()) lines.push(block.body);
    } else {
      if (block.title?.trim()) lines.push('', block.title);
      if (block.asset) lines.push('[图片]');
      if (block.caption?.trim()) lines.push(block.caption);
    }
  }
  if (lines.length === 1) lines.push('', '没有符合当前导出条件的记录。');
  return lines.join('\n');
}

function includedBlocks(model: ReportModel): ReportBlock[] {
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

function displayValue(value: ReportCellValue): string {
  return Array.isArray(value) ? value.join(', ') : value === null ? '' : String(value);
}
