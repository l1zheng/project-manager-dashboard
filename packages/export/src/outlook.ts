import type { ReportCellValue, ReportModel, ReportSection } from './report.js';
import { escapeHtml } from './report.js';

export type OutlookReport = {
  subject: string;
  htmlFragment: string;
  htmlDocument: string;
  plainText: string;
};

export function renderOutlookReport(model: ReportModel): OutlookReport {
  const htmlFragment = renderOutlookFragment(model);
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

function renderOutlookFragment(model: ReportModel): string {
  const cellPadding = model.density === 'compact' ? '5px 7px' : '9px 10px';
  const sections = includedSections(model)
    .map((section) => renderSection(section, model, cellPadding))
    .join('');
  return `<main style="max-width:1100px;margin:0 auto"><h1 style="margin:0 0 6px 0;font-size:26px;color:#17233c">${escapeHtml(model.title)}</h1>${model.period ? `<p style="margin:0 0 24px 0;color:#657084">${escapeHtml(model.period)}</p>` : ''}${sections || '<p style="margin:0;color:#5f6b7c">没有符合当前导出条件的记录。</p>'}</main>`;
}

function renderSection(section: ReportSection, model: ReportModel, cellPadding: string): string {
  const headers = section.fields
    .map(
      (field) =>
        `<th style="${field.width ? `width:${field.width}px;` : ''}padding:${cellPadding};border:1px solid #cfd7e3;background:#eef2f7;color:#344054;text-align:left;font-size:12px">${escapeHtml(field.name)}</th>`
    )
    .join('');
  const rows = section.rows
    .map(
      (row) =>
        `<tr>${row.values
          .map((value, index) => {
            const isStatus = model.highlightStatus && section.fields[index]?.type === 'status';
            const display = displayValue(value);
            return `<td style="padding:${cellPadding};border:1px solid #d9dfe8;vertical-align:top;overflow-wrap:anywhere;${isStatus && display ? 'background:#edf4ff;color:#315fce;font-weight:600;' : ''}">${escapeHtml(display)}</td>`;
          })
          .join('')}</tr>`
    )
    .join('');
  return `<section style="margin:0 0 24px 0"><h2 style="margin:0 0 8px 0;font-size:18px;color:#24324a">${escapeHtml(section.title)}</h2>${section.description ? `<p style="margin:0 0 10px 0;color:#5f6b7c">${escapeHtml(section.description)}</p>` : ''}<table role="table" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;table-layout:fixed"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></section>`;
}

function renderOutlookPlainText(model: ReportModel): string {
  const lines = [normalizeMailSubject(model.title)];
  if (model.period) lines.push(model.period);
  for (const section of includedSections(model)) {
    lines.push('', section.title);
    if (section.description) lines.push(section.description);
    lines.push(section.fields.map((field) => field.name).join('\t'));
    for (const row of section.rows) lines.push(row.values.map(displayValue).join('\t'));
  }
  if (lines.length === 1) lines.push('', '没有符合当前导出条件的记录。');
  return lines.join('\n');
}

function includedSections(model: ReportModel): ReportSection[] {
  return model.sections.filter(
    (section) => section.includeInExport && (model.includeEmptySections || section.rows.length > 0)
  );
}

function displayValue(value: ReportCellValue): string {
  return Array.isArray(value) ? value.join(', ') : value === null ? '' : String(value);
}
