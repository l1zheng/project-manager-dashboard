import type ExcelJS from 'exceljs';

export const EXCEL_THEME = {
  font: 'Microsoft YaHei',
  color: {
    ink: 'FF243447',
    inkStrong: 'FF172B3A',
    muted: 'FF66778A',
    accent: 'FF4F7693',
    accentDark: 'FF355E7A',
    accentSoft: 'FFE8F0F5',
    headerFill: 'FFF0F4F7',
    stripeFill: 'FFF8FAFB',
    border: 'FFD7E0E7',
    borderSoft: 'FFE8EDF1',
    white: 'FFFFFFFF',
    statusActiveFill: 'FFE8F1FB',
    statusActiveText: 'FF245A8D',
    statusDoneFill: 'FFE8F4EC',
    statusDoneText: 'FF22613D',
    statusPausedFill: 'FFFFF3DC',
    statusPausedText: 'FF805000',
    statusCriticalFill: 'FFFBEAEC',
    statusCriticalText: 'FF9F2D35',
    statusNeutralFill: 'FFF1F3F5',
    statusNeutralText: 'FF536170'
  }
} as const;

type StatusTone = 'active' | 'done' | 'paused' | 'critical' | 'neutral';

export function statusTone(value: unknown): StatusTone {
  const normalized = String(value ?? '')
    .trim()
    .toLocaleLowerCase();
  if (/完成|关闭|已解决|closed|done|resolved/.test(normalized)) return 'done';
  if (/暂停|暂缓|搁置|suspend|on hold|paused/.test(normalized)) return 'paused';
  if (/阻塞|逾期|严重|高风险|blocked|overdue|critical|failed/.test(normalized)) return 'critical';
  if (/进行|处理中|跟踪|开启|open|progress|tracking|active/.test(normalized)) return 'active';
  return 'neutral';
}

export function statusColors(value: unknown): { fill: string; text: string } {
  const tone = statusTone(value);
  return {
    active: {
      fill: EXCEL_THEME.color.statusActiveFill,
      text: EXCEL_THEME.color.statusActiveText
    },
    done: { fill: EXCEL_THEME.color.statusDoneFill, text: EXCEL_THEME.color.statusDoneText },
    paused: {
      fill: EXCEL_THEME.color.statusPausedFill,
      text: EXCEL_THEME.color.statusPausedText
    },
    critical: {
      fill: EXCEL_THEME.color.statusCriticalFill,
      text: EXCEL_THEME.color.statusCriticalText
    },
    neutral: {
      fill: EXCEL_THEME.color.statusNeutralFill,
      text: EXCEL_THEME.color.statusNeutralText
    }
  }[tone];
}

export function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

export function dataCellBorder(): Partial<ExcelJS.Borders> {
  return {
    bottom: { style: 'thin', color: { argb: EXCEL_THEME.color.border } },
    right: { style: 'thin', color: { argb: EXCEL_THEME.color.borderSoft } }
  };
}
