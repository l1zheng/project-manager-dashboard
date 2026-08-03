export type ReportFormat = 'outlook_html' | 'excel_editable' | 'excel_presentation';

export interface ReportExportRequest {
  format: ReportFormat;
  dashboardId: string;
}

export interface ReportExportResult {
  format: ReportFormat;
  fileName: string;
  contentType: string;
}

export * from './report.js';
