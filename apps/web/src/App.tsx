import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  FilterCondition,
  FilterExpression,
  FilterOperator,
  FieldType,
  HealthResponse,
  ViewConfig
} from '@project-manager/domain';

type DatabaseSummary = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
};

type Field = {
  id: string;
  name: string;
  type: FieldType;
  description: string | null;
  config: {
    version: 1;
    options?: Array<{ id: string; label: string; color?: string }>;
    completion?: { completedOptionIds: string[] };
  };
};

type RecordRow = {
  id: string;
  sequenceNumber: number;
  values: Record<string, string | number | boolean | string[]>;
};

type EditableValue = string | boolean | string[];

type DatabaseDetail = {
  database: DatabaseSummary;
  fields: Field[];
  records: RecordRow[];
};
type ViewSummary = {
  id: string;
  name: string;
  config: ViewConfig;
};
type DashboardSummary = { id: string; name: string; description: string | null };
type DashboardBlock = {
  id: string;
  sortOrder: number;
  titleOverride: string | null;
  description: string | null;
  isCollapsed: boolean;
  includeInExport: boolean;
  view: { view: ViewSummary; fields: Field[]; records: RecordRow[] };
};
type DashboardDetail = { dashboard: DashboardSummary; blocks: DashboardBlock[] };
type RestoreInspection = {
  restoreId: string;
  inspectedAt: string;
  manifest: {
    createdAt: string;
    applicationVersion: string;
    database: { bytes: number; migrations: { appliedCount: number; totalCount: number } };
    workspace: { id: string; name: string } | null;
  };
  migration: { appliedCount: number; pendingCount: number; totalCount: number };
};

type HealthState =
  { kind: 'loading' } | { kind: 'ready'; response: HealthResponse } | { kind: 'error' };

const fieldTypes: Array<{ value: FieldType; label: string }> = [
  { value: 'short_text', label: '单行文本' },
  { value: 'long_text', label: '多行文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'single_select', label: '单选' },
  { value: 'multi_select', label: '多选' },
  { value: 'status', label: '状态' },
  { value: 'person', label: '人员' },
  { value: 'checkbox', label: '复选框' },
  { value: 'url', label: '链接' },
  { value: 'sequence', label: '自动编号' }
];

const optionFieldTypes = new Set<FieldType>(['single_select', 'multi_select', 'status']);

export function App() {
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });
  const [databases, setDatabases] = useState<DatabaseSummary[]>([]);
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>();
  const [dashboardDetail, setDashboardDetail] = useState<DashboardDetail>();
  const [dashboardName, setDashboardName] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [reportPeriod, setReportPeriod] = useState('');
  const [reportDensity, setReportDensity] = useState<'compact' | 'comfortable'>('comfortable');
  const [includeEmptySections, setIncludeEmptySections] = useState(false);
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [highlightReportStatus, setHighlightReportStatus] = useState(true);
  const [reportPreviewHtml, setReportPreviewHtml] = useState('');
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>();
  const [detail, setDetail] = useState<DatabaseDetail>();
  const [views, setViews] = useState<ViewSummary[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string>();
  const [viewRecords, setViewRecords] = useState<RecordRow[]>();
  const [viewName, setViewName] = useState('');
  const [viewRenameDraft, setViewRenameDraft] = useState('');
  const [filterFieldId, setFilterFieldId] = useState('');
  const [filterOperator, setFilterOperator] = useState<FilterOperator>('contains');
  const [filterValue, setFilterValue] = useState('');
  const [filterExpressionDraft, setFilterExpressionDraft] = useState<FilterExpression | null>(null);
  const [viewConfigDraft, setViewConfigDraft] = useState<ViewConfig>();
  const [isCreatingDatabase, setIsCreatingDatabase] = useState(false);
  const [isAddingField, setIsAddingField] = useState(false);
  const [isAddingRecord, setIsAddingRecord] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [exportNotice, setExportNotice] = useState<string>();
  const [restoreInspection, setRestoreInspection] = useState<RestoreInspection>();
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restoreReplacementConfirmed, setRestoreReplacementConfirmed] = useState(false);
  const [restoreRestartRequired, setRestoreRestartRequired] = useState(false);
  const [databaseName, setDatabaseName] = useState('');
  const [databaseDescription, setDatabaseDescription] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('short_text');
  const [optionLabels, setOptionLabels] = useState('未开始, 进行中, 已完成');
  const [completedOptionIds, setCompletedOptionIds] = useState<string[]>([]);
  const [fieldNameDrafts, setFieldNameDrafts] = useState<Record<string, string>>({});
  const [newRecordValues, setNewRecordValues] = useState<Record<string, EditableValue>>({});
  const [recordValueDrafts, setRecordValueDrafts] = useState<
    Record<string, Record<string, EditableValue>>
  >({});
  const [lastArchived, setLastArchived] = useState<
    { kind: '数据库' | '字段' | '记录' | '视图'; id: string } | undefined
  >();

  const selectedDatabase = useMemo(
    () => databases.find((database) => database.id === selectedDatabaseId),
    [databases, selectedDatabaseId]
  );
  const selectedView = useMemo(
    () => views.find((view) => view.id === selectedViewId),
    [selectedViewId, views]
  );
  const visibleFields = useMemo(() => {
    if (!detail || !selectedView) return detail?.fields ?? [];
    return selectedView.config.visibleFieldIds
      .map((fieldId) => detail.fields.find((field) => field.id === fieldId))
      .filter((field): field is Field => field !== undefined);
  }, [detail, selectedView]);

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (selectedDatabaseId) {
      setViewRecords(undefined);
      void loadDetail(selectedDatabaseId);
      void loadViews(selectedDatabaseId);
    } else {
      setDetail(undefined);
    }
  }, [selectedDatabaseId]);

  useEffect(() => {
    if (selectedDashboardId) void loadDashboard(selectedDashboardId);
    else setDashboardDetail(undefined);
  }, [selectedDashboardId]);

  useEffect(() => {
    if (!selectedViewId) {
      setViewRecords(undefined);
      return;
    }
    void getViewRecords(selectedViewId).catch(() => setError('读取视图失败。'));
  }, [selectedViewId]);

  useEffect(() => {
    const filter = views.find((view) => view.id === selectedViewId)?.config.filter;
    if (!filter || filter.kind !== 'condition') {
      setFilterFieldId('');
      setFilterOperator('contains');
      setFilterValue('');
      return;
    }
    setFilterFieldId(filter.fieldId);
    setFilterOperator(filter.operator);
    setFilterValue(
      Array.isArray(filter.value) ? String(filter.value[0] ?? '') : String(filter.value ?? '')
    );
  }, [selectedViewId, views]);

  useEffect(() => {
    setFilterExpressionDraft(selectedView?.config.filter ?? null);
  }, [selectedView]);

  useEffect(() => {
    setViewRenameDraft(selectedView?.name ?? '');
  }, [selectedView]);

  useEffect(() => {
    setViewConfigDraft(selectedView ? structuredClone(selectedView.config) : undefined);
  }, [selectedView]);

  async function loadViews(databaseId: string) {
    const nextViews = await request<ViewSummary[]>(`/api/databases/${databaseId}/views`);
    setViews(nextViews);
    setSelectedViewId((current) =>
      nextViews.some((view) => view.id === current) ? current : nextViews[0]?.id
    );
  }

  async function getViewRecords(viewId: string) {
    const view = await request<{ records: RecordRow[] }>(`/api/views/${viewId}`);
    setViewRecords(view.records);
  }

  async function refreshSelectedView() {
    if (selectedViewId) await getViewRecords(selectedViewId);
  }

  async function refreshDashboard() {
    if (selectedDashboardId) await loadDashboard(selectedDashboardId);
  }

  async function saveFilter() {
    if (!selectedViewId || !detail || !filterFieldId) return;
    const view = views.find((item) => item.id === selectedViewId);
    if (!view) return;
    setIsSaving(true);
    try {
      await request(`/api/views/${selectedViewId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          config: {
            ...view.config,
            filter: buildFilterCondition(filterFieldId, filterOperator, filterValue)
          }
        })
      });
      await loadViews(detail.database.id);
      await refreshSelectedView();
      await refreshDashboard();
    } catch (requestError) {
      setError(readRequestError(requestError, '保存筛选失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAdvancedFilter() {
    if (!selectedViewId || !detail || !selectedView) return;
    setIsSaving(true);
    setError(undefined);
    try {
      await request(`/api/views/${selectedViewId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          config: { ...selectedView.config, filter: filterExpressionDraft }
        })
      });
      await loadViews(detail.database.id);
      await refreshSelectedView();
      await refreshDashboard();
    } catch (requestError) {
      setError(readRequestError(requestError, '保存高级筛选失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveViewConfiguration() {
    if (!selectedViewId || !detail || !viewConfigDraft) return;
    if (viewConfigDraft.visibleFieldIds.length === 0) {
      setError('一个视图至少需要显示一个字段。');
      return;
    }
    setIsSaving(true);
    setError(undefined);
    try {
      await request(`/api/views/${selectedViewId}`, {
        method: 'PATCH',
        body: JSON.stringify({ config: viewConfigDraft })
      });
      await loadViews(detail.database.id);
      await refreshSelectedView();
      await refreshDashboard();
    } catch (requestError) {
      setError(readRequestError(requestError, '保存视图配置失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  function toggleVisibleField(fieldId: string, visible: boolean) {
    setViewConfigDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        visibleFieldIds: visible
          ? [...current.visibleFieldIds, fieldId]
          : current.visibleFieldIds.filter((id) => id !== fieldId)
      };
    });
  }

  function moveVisibleField(fieldId: string, offset: -1 | 1) {
    setViewConfigDraft((current) => {
      if (!current) return current;
      const currentIndex = current.visibleFieldIds.indexOf(fieldId);
      const nextIndex = currentIndex + offset;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.visibleFieldIds.length) {
        return current;
      }
      const visibleFieldIds = [...current.visibleFieldIds];
      [visibleFieldIds[currentIndex], visibleFieldIds[nextIndex]] = [
        visibleFieldIds[nextIndex]!,
        visibleFieldIds[currentIndex]!
      ];
      return { ...current, visibleFieldIds };
    });
  }

  async function initialize() {
    try {
      const [healthResponse, databaseList, dashboardList] = await Promise.all([
        request<HealthResponse>('/api/health'),
        request<DatabaseSummary[]>('/api/databases'),
        request<DashboardSummary[]>('/api/dashboards')
      ]);
      setHealth({ kind: 'ready', response: healthResponse });
      setRestoreRestartRequired(healthResponse.storage?.restorePending === true);
      if (healthResponse.storage?.restore?.status === 'restored') {
        setExportNotice('工作区恢复已完成，当前数据来自所选备份。');
      } else if (healthResponse.storage?.restore?.status === 'rolled_back') {
        setError(
          `工作区恢复未能完成，系统已自动回滚到恢复前数据。${healthResponse.storage.restore.message ? ` 原因：${healthResponse.storage.restore.message}` : ''}`
        );
      }
      setDatabases(databaseList);
      setDashboards(dashboardList);
      setSelectedDashboardId(dashboardList[0]?.id);
      setSelectedDatabaseId((current) => current ?? databaseList[0]?.id);
    } catch {
      setHealth({ kind: 'error' });
      setError('无法连接本地服务。请确认 API 已启动。');
    }
  }

  async function loadDashboard(dashboardId: string) {
    try {
      setDashboardDetail(await request<DashboardDetail>(`/api/dashboards/${dashboardId}`));
    } catch {
      setError('读取看板失败。');
    }
  }

  async function createDashboard() {
    if (!dashboardName.trim()) return;
    setIsSaving(true);
    try {
      const dashboard = await request<DashboardSummary>('/api/dashboards', {
        method: 'POST',
        body: JSON.stringify({ name: dashboardName })
      });
      setDashboards((current) => [...current, dashboard]);
      setSelectedDashboardId(dashboard.id);
      setDashboardName('');
    } catch (requestError) {
      setError(readRequestError(requestError, '创建看板失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function addViewToDashboard() {
    if (!selectedDashboardId || !selectedViewId) return;
    setIsSaving(true);
    try {
      await request(`/api/dashboards/${selectedDashboardId}/blocks`, {
        method: 'POST',
        body: JSON.stringify({ viewId: selectedViewId })
      });
      await loadDashboard(selectedDashboardId);
    } catch (requestError) {
      setError(readRequestError(requestError, '添加看板区块失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function updateDashboardBlock(blockId: string, input: Record<string, unknown>) {
    if (!selectedDashboardId) return;
    setIsSaving(true);
    try {
      await request(`/api/dashboard-blocks/${blockId}`, {
        method: 'PATCH',
        body: JSON.stringify(input)
      });
      await loadDashboard(selectedDashboardId);
    } catch (requestError) {
      setError(readRequestError(requestError, '保存看板区块失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function previewReport() {
    if (!selectedDashboardId) return;
    setIsSaving(true);
    setError(undefined);
    try {
      const query = new URLSearchParams();
      if (reportTitle.trim()) query.set('title', reportTitle.trim());
      if (reportPeriod.trim()) query.set('period', reportPeriod.trim());
      query.set('density', reportDensity);
      query.set('includeEmptySections', String(includeEmptySections));
      query.set('includeCompleted', String(includeCompleted));
      query.set('highlightStatus', String(highlightReportStatus));
      const preview = await request<{ html: string }>(
        `/api/dashboards/${selectedDashboardId}/report-preview?${query.toString()}`
      );
      setReportPreviewHtml(preview.html);
    } catch (requestError) {
      setError(readRequestError(requestError, '生成报告预览失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  function reportQuery() {
    const query = new URLSearchParams();
    if (reportTitle.trim()) query.set('title', reportTitle.trim());
    if (reportPeriod.trim()) query.set('period', reportPeriod.trim());
    query.set('density', reportDensity);
    query.set('includeEmptySections', String(includeEmptySections));
    query.set('includeCompleted', String(includeCompleted));
    query.set('highlightStatus', String(highlightReportStatus));
    return query;
  }

  async function createOutlookDraft() {
    if (!selectedDashboardId) return;
    setIsSaving(true);
    setError(undefined);
    setExportNotice(undefined);
    try {
      await request(
        `/api/dashboards/${selectedDashboardId}/export/outlook-draft?${reportQuery()}`,
        {
          method: 'POST',
          headers: { 'x-project-manager-action': 'create-outlook-draft' }
        }
      );
      setExportNotice('已在经典 Outlook 中打开草稿；请补充收件人并自行检查、发送。');
    } catch (requestError) {
      setError(readRequestError(requestError, '创建 Outlook 草稿失败。可使用复制或 HTML 下载。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function copyOutlookReport() {
    if (!selectedDashboardId) return;
    setIsSaving(true);
    setError(undefined);
    setExportNotice(undefined);
    try {
      const response = await fetch(
        `/api/dashboards/${selectedDashboardId}/export/outlook.html?${reportQuery()}`
      );
      if (!response.ok) throw new Error(`获取报告失败（${response.status}）`);
      const html = await response.text();
      if (!navigator.clipboard || !window.ClipboardItem) {
        throw new Error('当前浏览器不支持富文本复制，请下载 HTML 报告。');
      }
      const text = new DOMParser().parseFromString(html, 'text/html').body.innerText;
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })
      ]);
      setExportNotice('报告已复制为富文本，可直接粘贴到 Outlook 草稿。');
    } catch (requestError) {
      setError(readRequestError(requestError, '复制报告失败，请下载 HTML 报告。'));
    } finally {
      setIsSaving(false);
    }
  }

  function downloadOutlookHtml() {
    if (!selectedDashboardId) return;
    const anchor = document.createElement('a');
    anchor.href = `/api/dashboards/${selectedDashboardId}/export/outlook.html?${reportQuery()}`;
    anchor.download = `${reportTitle.trim() || dashboardDetail?.dashboard.name || '项目周报'}-Outlook报告.html`;
    anchor.click();
  }

  async function downloadWorkspaceBackup() {
    setIsSaving(true);
    setError(undefined);
    try {
      const response = await fetch('/api/workspace/backup');
      if (!response.ok) {
        const payload = (await response.json().catch(() => undefined)) as
          { message?: string } | undefined;
        throw new Error(payload?.message ?? `备份失败（${response.status}）`);
      }
      const backup = await response.blob();
      const downloadUrl = URL.createObjectURL(backup);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = 'ProjectManagerWorkspace.pmdbackup';
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
      setExportNotice('工作区备份已下载。请将 .pmdbackup 文件保存到受保护的位置。');
    } catch (requestError) {
      setError(readRequestError(requestError, '下载工作区备份失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function inspectWorkspaceRestore(file: File) {
    if (!file.name.toLowerCase().endsWith('.pmdbackup')) {
      setError('请选择 .pmdbackup 工作区备份文件。');
      return;
    }
    if (file.size === 0 || file.size > 128 * 1024 * 1024) {
      setError('备份文件必须大于 0 且不超过 128 MB。');
      return;
    }

    setIsSaving(true);
    setError(undefined);
    setExportNotice(undefined);
    try {
      const response = await fetch('/api/workspace/restore/inspect', {
        method: 'POST',
        headers: { 'content-type': 'application/vnd.project-manager.workspace-backup' },
        body: file
      });
      const payload = (await response.json().catch(() => undefined)) as
        RestoreInspection | { message?: string } | undefined;
      if (!response.ok) {
        throw new Error(
          payload && 'message' in payload
            ? (payload.message ?? `检查失败（${response.status}）`)
            : `检查失败（${response.status}）`
        );
      }
      setRestoreInspection(payload as RestoreInspection);
      setRestoreFileName(file.name);
      setRestoreReplacementConfirmed(false);
    } catch (requestError) {
      setError(readRequestError(requestError, '检查工作区备份失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function cancelWorkspaceRestore() {
    const restoreId = restoreInspection?.restoreId;
    if (!restoreId) return;
    setIsSaving(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/workspace/restore/${restoreId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`取消失败（${response.status}）`);
      setRestoreInspection(undefined);
      setRestoreFileName('');
      setRestoreReplacementConfirmed(false);
    } catch (requestError) {
      setError(readRequestError(requestError, '清理暂存的恢复文件失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmWorkspaceRestore() {
    if (!restoreInspection || !restoreReplacementConfirmed) return;
    setIsSaving(true);
    setError(undefined);
    try {
      const response = await fetch('/api/workspace/restore/confirm', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-project-manager-action': 'confirm-workspace-restore'
        },
        body: JSON.stringify({
          restoreId: restoreInspection.restoreId,
          confirmation: 'replace-workspace'
        })
      });
      const payload = (await response.json().catch(() => undefined)) as
        { message?: string; restartRequired?: boolean } | undefined;
      if (!response.ok || !payload?.restartRequired) {
        throw new Error(payload?.message ?? `准备恢复失败（${response.status}）`);
      }
      setRestoreInspection(undefined);
      setRestoreFileName('');
      setRestoreReplacementConfirmed(false);
      setRestoreRestartRequired(true);
      setExportNotice(
        '恢复任务已安全暂存，并已创建当前工作区的恢复前备份。请关闭并重新启动应用以完成恢复。'
      );
    } catch (requestError) {
      setError(readRequestError(requestError, '准备工作区恢复失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadEditableWorkbook() {
    if (!selectedDashboardId) return;
    setIsSaving(true);
    setError(undefined);
    try {
      const query = new URLSearchParams();
      if (reportTitle.trim()) query.set('title', reportTitle.trim());
      if (reportPeriod.trim()) query.set('period', reportPeriod.trim());
      query.set('density', reportDensity);
      query.set('includeEmptySections', String(includeEmptySections));
      query.set('includeCompleted', String(includeCompleted));
      query.set('highlightStatus', String(highlightReportStatus));
      const response = await fetch(
        `/api/dashboards/${selectedDashboardId}/export/editable.xlsx?${query.toString()}`
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => undefined)) as
          { message?: string } | undefined;
        throw new Error(payload?.message ?? `下载失败（${response.status}）`);
      }
      const workbook = await response.blob();
      const downloadUrl = URL.createObjectURL(workbook);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `${reportTitle.trim() || dashboardDetail?.dashboard.name || '项目周报'}-可编辑数据.xlsx`;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (requestError) {
      setError(readRequestError(requestError, '下载可编辑 Excel 失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadPresentationWorkbook() {
    if (!selectedDashboardId) return;
    setIsSaving(true);
    setError(undefined);
    try {
      const query = new URLSearchParams();
      if (reportTitle.trim()) query.set('title', reportTitle.trim());
      if (reportPeriod.trim()) query.set('period', reportPeriod.trim());
      query.set('density', reportDensity);
      query.set('includeEmptySections', String(includeEmptySections));
      query.set('includeCompleted', String(includeCompleted));
      query.set('highlightStatus', String(highlightReportStatus));
      const response = await fetch(
        `/api/dashboards/${selectedDashboardId}/export/presentation.xlsx?${query.toString()}`
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => undefined)) as
          { message?: string } | undefined;
        throw new Error(payload?.message ?? `下载失败（${response.status}）`);
      }
      const workbook = await response.blob();
      const downloadUrl = URL.createObjectURL(workbook);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `${reportTitle.trim() || dashboardDetail?.dashboard.name || '项目周报'}-展示版.xlsx`;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (requestError) {
      setError(readRequestError(requestError, '下载展示版 Excel 失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function loadDetail(databaseId: string) {
    try {
      const nextDetail = await request<DatabaseDetail>(`/api/databases/${databaseId}`);
      setDetail(nextDetail);
      setFieldNameDrafts(
        Object.fromEntries(nextDetail.fields.map((field) => [field.id, field.name]))
      );
      setRecordValueDrafts(
        Object.fromEntries(
          nextDetail.records.map((record) => [
            record.id,
            Object.fromEntries(
              nextDetail.fields.map((field) => [field.id, toEditableValue(field, record)])
            )
          ])
        )
      );
    } catch {
      setError('读取数据库结构失败。');
    }
  }

  async function createDatabase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!databaseName.trim()) return;

    setIsSaving(true);
    setError(undefined);
    try {
      const database = await request<DatabaseSummary>('/api/databases', {
        method: 'POST',
        body: JSON.stringify({
          name: databaseName,
          description: databaseDescription || null
        })
      });
      setDatabases((current) => [...current, database]);
      setSelectedDatabaseId(database.id);
      setDatabaseName('');
      setDatabaseDescription('');
      setIsCreatingDatabase(false);
    } catch (requestError) {
      setError(readRequestError(requestError, '创建数据库失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function createField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDatabaseId || !fieldName.trim()) return;

    setIsSaving(true);
    setError(undefined);
    try {
      const options = parseOptionDrafts(optionLabels);
      const config = optionFieldTypes.has(fieldType)
        ? {
            version: 1,
            options,
            completion:
              fieldType === 'status' && completedOptionIds.length > 0
                ? { completedOptionIds }
                : undefined
          }
        : { version: 1 };
      await request<Field>(`/api/databases/${selectedDatabaseId}/fields`, {
        method: 'POST',
        body: JSON.stringify({ name: fieldName, type: fieldType, config })
      });
      setFieldName('');
      setFieldType('short_text');
      setOptionLabels('未开始, 进行中, 已完成');
      setCompletedOptionIds([]);
      setIsAddingField(false);
      await loadDetail(selectedDatabaseId);
    } catch (requestError) {
      setError(readRequestError(requestError, '添加字段失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveFieldName(field: Field) {
    const nextName = fieldNameDrafts[field.id]?.trim();
    if (!nextName || nextName === field.name) return;

    setIsSaving(true);
    setError(undefined);
    try {
      await request<Field>(`/api/fields/${field.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: nextName })
      });
      if (selectedDatabaseId) await loadDetail(selectedDatabaseId);
      await refreshDashboard();
    } catch (requestError) {
      setError(readRequestError(requestError, '保存字段名称失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleCompletedOption(field: Field, optionId: string) {
    const currentOptionIds = field.config.completion?.completedOptionIds ?? [];
    const nextOptionIds = currentOptionIds.includes(optionId)
      ? currentOptionIds.filter((id) => id !== optionId)
      : [...currentOptionIds, optionId];

    setIsSaving(true);
    setError(undefined);
    try {
      await request<Field>(`/api/fields/${field.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          config: {
            ...field.config,
            completion: nextOptionIds.length > 0 ? { completedOptionIds: nextOptionIds } : undefined
          }
        })
      });
      if (selectedDatabaseId) await loadDetail(selectedDatabaseId);
      await refreshDashboard();
    } catch (requestError) {
      setError(readRequestError(requestError, '保存完成状态失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function createRecord() {
    if (!selectedDatabaseId || !detail) return;

    setIsSaving(true);
    setError(undefined);
    try {
      await request<RecordRow>(`/api/databases/${selectedDatabaseId}/records`, {
        method: 'POST',
        body: JSON.stringify({ values: serializeRecordValues(detail.fields, newRecordValues) })
      });
      setNewRecordValues({});
      setIsAddingRecord(false);
      await loadDetail(selectedDatabaseId);
      await refreshSelectedView();
      await refreshDashboard();
    } catch (requestError) {
      setError(readRequestError(requestError, '新增记录失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function createView() {
    if (!selectedDatabaseId || !detail || !viewName.trim()) return;
    setIsSaving(true);
    try {
      const view = await request<ViewSummary>(`/api/databases/${selectedDatabaseId}/views`, {
        method: 'POST',
        body: JSON.stringify({
          name: viewName,
          config: {
            version: 1,
            visibleFieldIds: detail.fields.map((field) => field.id),
            filter: null,
            sorts: [],
            fieldWidths: {},
            includeArchived: false
          }
        })
      });
      setViews((current) => [...current, view]);
      setSelectedViewId(view.id);
      setViewName('');
    } catch (requestError) {
      setError(readRequestError(requestError, '创建视图失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function renameView() {
    if (!selectedView || !viewRenameDraft.trim() || viewRenameDraft.trim() === selectedView.name) {
      return;
    }
    setIsSaving(true);
    try {
      await request(`/api/views/${selectedView.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: viewRenameDraft.trim() })
      });
      if (detail) await loadViews(detail.database.id);
    } catch (requestError) {
      setError(readRequestError(requestError, '重命名视图失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function duplicateView() {
    if (!selectedView || !detail) return;
    setIsSaving(true);
    try {
      const duplicate = await request<ViewSummary>(`/api/databases/${detail.database.id}/views`, {
        method: 'POST',
        body: JSON.stringify({
          name: `${selectedView.name} 副本`,
          config: selectedView.config
        })
      });
      await loadViews(detail.database.id);
      setSelectedViewId(duplicate.id);
    } catch (requestError) {
      setError(readRequestError(requestError, '复制视图失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function updateRecord(record: RecordRow) {
    if (!detail) return;

    setIsSaving(true);
    setError(undefined);
    try {
      await request<RecordRow>(`/api/records/${record.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          values: serializeRecordValues(detail.fields, recordValueDrafts[record.id] ?? {})
        })
      });
      if (selectedDatabaseId) await loadDetail(selectedDatabaseId);
      await refreshSelectedView();
      await refreshDashboard();
    } catch (requestError) {
      setError(readRequestError(requestError, '保存记录失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveItem(kind: '数据库' | '字段' | '记录' | '视图', id: string) {
    const resource =
      kind === '数据库'
        ? 'databases'
        : kind === '字段'
          ? 'fields'
          : kind === '视图'
            ? 'views'
            : 'records';
    setIsSaving(true);
    setError(undefined);
    try {
      await request(`/${'api'}/${resource}/${id}/archive`, { method: 'POST' });
      setLastArchived({ kind, id });
      if (kind === '数据库') {
        const databaseList = await request<DatabaseSummary[]>('/api/databases');
        setDatabases(databaseList);
        setSelectedDatabaseId(databaseList[0]?.id);
      } else if (kind === '视图' && selectedDatabaseId) {
        await loadViews(selectedDatabaseId);
      } else if (selectedDatabaseId) {
        await loadDetail(selectedDatabaseId);
        await refreshSelectedView();
        await refreshDashboard();
      }
    } catch (requestError) {
      setError(readRequestError(requestError, `归档${kind}失败。`));
    } finally {
      setIsSaving(false);
    }
  }

  async function restoreLastArchived() {
    if (!lastArchived) return;
    const { kind, id } = lastArchived;
    const resource =
      kind === '数据库'
        ? 'databases'
        : kind === '字段'
          ? 'fields'
          : kind === '视图'
            ? 'views'
            : 'records';
    setIsSaving(true);
    try {
      await request(`/${'api'}/${resource}/${id}/restore`, { method: 'POST' });
      const databaseList = await request<DatabaseSummary[]>('/api/databases');
      setDatabases(databaseList);
      if (kind === '数据库') setSelectedDatabaseId(id);
      else if (kind === '视图' && selectedDatabaseId) {
        await loadViews(selectedDatabaseId);
        setSelectedViewId(id);
      } else if (selectedDatabaseId) {
        await loadDetail(selectedDatabaseId);
        await refreshSelectedView();
        await refreshDashboard();
      }
      setLastArchived(undefined);
    } catch (requestError) {
      setError(readRequestError(requestError, `恢复${kind}失败。`));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="工作区导航">
        <div className="brand">
          <span className="brand-mark">PM</span>
          <div>
            <strong>项目管理工作台</strong>
            <span>个人工作区</span>
          </div>
        </div>

        <div className="nav-label">数据库</div>
        <nav className="database-nav" aria-label="数据库列表">
          {databases.map((database) => (
            <button
              className={`database-nav-item ${database.id === selectedDatabaseId ? 'is-active' : ''}`}
              key={database.id}
              onClick={() => setSelectedDatabaseId(database.id)}
              type="button"
            >
              <span
                className="database-dot"
                style={{ backgroundColor: database.color ?? undefined }}
              />
              <span>{database.name}</span>
            </button>
          ))}
        </nav>
        <button
          className="new-database-link"
          disabled={restoreRestartRequired}
          onClick={() => setIsCreatingDatabase(true)}
          type="button"
        >
          ＋ 新建数据库
        </button>
        <button
          className="new-database-link"
          disabled={
            isSaving ||
            health.kind !== 'ready' ||
            restoreRestartRequired ||
            Boolean(restoreInspection)
          }
          onClick={() => void downloadWorkspaceBackup()}
          type="button"
        >
          ⇩ 备份整个工作区
        </button>
        <input
          accept=".pmdbackup,application/zip"
          aria-label="选择工作区备份文件"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void inspectWorkspaceRestore(file);
          }}
          ref={restoreFileInputRef}
          type="file"
        />
        <button
          className="new-database-link"
          disabled={
            isSaving ||
            health.kind !== 'ready' ||
            restoreRestartRequired ||
            Boolean(restoreInspection)
          }
          onClick={() => restoreFileInputRef.current?.click()}
          type="button"
        >
          ⇧ 从备份恢复
        </button>

        <div className="sidebar-footer">
          <span className={`status-light ${health.kind}`} />
          <span>{health.kind === 'ready' ? '本地数据已连接' : '正在检查本地服务'}</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">数据库结构配置 · Phase 1</p>
            <h1>{selectedDatabase?.name ?? '创建你的第一个数据库'}</h1>
            <p className="subtitle">
              {selectedDatabase?.description ?? '每个数据库可使用自己的字段名称与业务语义。'}
            </p>
            {selectedDatabase && (
              <button
                className="button tertiary small danger archive-database"
                disabled={isSaving}
                onClick={() => void archiveItem('数据库', selectedDatabase.id)}
                type="button"
              >
                归档此数据库
              </button>
            )}
          </div>
          <div className={`health ${health.kind}`} aria-live="polite">
            <span className="health-dot" />
            {health.kind === 'ready' && 'SQLite 已就绪'}
            {health.kind === 'loading' && '正在连接'}
            {health.kind === 'error' && '服务不可用'}
          </div>
        </header>

        {restoreRestartRequired && (
          <div className="restore-restart-lock" role="alertdialog" aria-modal="true">
            <section className="restore-restart-card">
              <span className="section-kicker">恢复已安全准备</span>
              <h2>请关闭并重新启动应用</h2>
              <p>
                当前工作区已切换为只读。重新启动后，系统会应用所选备份；若启动验证失败，会自动恢复到确认前的数据。
              </p>
            </section>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}
        {exportNotice && (
          <div className="archive-notice" role="status">
            {exportNotice}
          </div>
        )}
        {restoreInspection && (
          <section className="panel creation-panel" aria-label="确认恢复工作区">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">恢复检查已通过</span>
                <h2>确认替换当前工作区</h2>
                <p>{restoreFileName}</p>
              </div>
            </div>
            <div className="form-grid">
              <div>
                <strong>备份工作区：</strong>
                {restoreInspection.manifest.workspace?.name ?? '空工作区'}
              </div>
              <div>
                <strong>创建时间：</strong>
                {new Date(restoreInspection.manifest.createdAt).toLocaleString('zh-CN')}
              </div>
              <div>
                <strong>应用版本：</strong>
                {restoreInspection.manifest.applicationVersion}
              </div>
              <div>
                <strong>数据库大小：</strong>
                {(restoreInspection.manifest.database.bytes / 1024 / 1024).toFixed(2)} MB
              </div>
              <div className="error-banner">
                恢复将在重启时完整替换当前工作区。确认前，系统会自动创建一份当前工作区备份；若恢复启动失败，将自动回滚。
              </div>
              <label className="inline-option">
                <input
                  checked={restoreReplacementConfirmed}
                  onChange={(event) => setRestoreReplacementConfirmed(event.target.checked)}
                  type="checkbox"
                />
                我已确认备份信息，并理解当前工作区将被完整替换
              </label>
              <div className="form-actions">
                <button
                  className="button secondary"
                  disabled={isSaving}
                  onClick={() => void cancelWorkspaceRestore()}
                  type="button"
                >
                  取消恢复
                </button>
                <button
                  className="button primary"
                  disabled={isSaving || !restoreReplacementConfirmed}
                  onClick={() => void confirmWorkspaceRestore()}
                  type="button"
                >
                  {isSaving ? '正在准备…' : '确认并准备重启'}
                </button>
              </div>
            </div>
          </section>
        )}
        {lastArchived && (
          <div className="archive-notice" role="status">
            已归档{lastArchived.kind}。
            <button disabled={isSaving} onClick={() => void restoreLastArchived()} type="button">
              撤销
            </button>
          </div>
        )}

        {isCreatingDatabase && (
          <section className="panel creation-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">自定义结构</span>
                <h2>新建数据库</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setIsCreatingDatabase(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <form className="form-grid" onSubmit={createDatabase}>
              <label>
                数据库名称
                <input
                  autoFocus
                  value={databaseName}
                  onChange={(event) => setDatabaseName(event.target.value)}
                  placeholder="例如：需求跟踪、关键风险"
                />
              </label>
              <label>
                说明（可选）
                <input
                  value={databaseDescription}
                  onChange={(event) => setDatabaseDescription(event.target.value)}
                  placeholder="说明这个数据库管理什么"
                />
              </label>
              <div className="form-actions">
                <button
                  className="button secondary"
                  onClick={() => setIsCreatingDatabase(false)}
                  type="button"
                >
                  取消
                </button>
                <button className="button primary" disabled={isSaving} type="submit">
                  {isSaving ? '正在创建…' : '创建数据库'}
                </button>
              </div>
            </form>
          </section>
        )}

        {detail ? (
          <>
            <section className="panel schema-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">独立字段</span>
                  <h2>字段结构</h2>
                  <p>字段名称可直接改动；已有记录按稳定字段 ID 保存，不会丢失。</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    setFieldName('');
                    setFieldType('short_text');
                    setOptionLabels('未开始, 进行中, 已完成');
                    setCompletedOptionIds([]);
                    setIsAddingField(true);
                  }}
                  type="button"
                >
                  ＋ 添加字段
                </button>
              </div>

              <div className="field-list">
                {detail.fields.length === 0 && (
                  <div className="empty-state">
                    <strong>还没有字段</strong>
                    <span>先定义这个数据库自己的业务列，例如“需求名称”或“风险消减措施”。</span>
                  </div>
                )}
                {detail.fields.map((field) => (
                  <div className="field-item" key={field.id}>
                    <div className="field-row">
                      <span className="drag-placeholder">⠿</span>
                      <span className="field-type-tag">
                        {fieldTypes.find((item) => item.value === field.type)?.label}
                      </span>
                      <input
                        aria-label={`${field.name}的字段名称`}
                        value={fieldNameDrafts[field.id] ?? field.name}
                        onChange={(event) =>
                          setFieldNameDrafts((current) => ({
                            ...current,
                            [field.id]: event.target.value
                          }))
                        }
                      />
                      <span className="field-id">ID · {field.id.slice(0, 8)}</span>
                      <button
                        className="button tertiary small"
                        disabled={isSaving || fieldNameDrafts[field.id]?.trim() === field.name}
                        onClick={() => void saveFieldName(field)}
                        type="button"
                      >
                        保存
                      </button>
                      <button
                        className="button tertiary small danger"
                        disabled={isSaving}
                        onClick={() => void archiveItem('字段', field.id)}
                        type="button"
                      >
                        归档
                      </button>
                    </div>
                    {field.type === 'status' && (
                      <div className="completion-options">
                        <span>标记代表“已完成”的状态：</span>
                        {field.config.options?.map((option) => (
                          <label className="inline-option" key={option.id}>
                            <input
                              checked={
                                field.config.completion?.completedOptionIds.includes(option.id) ??
                                false
                              }
                              disabled={isSaving}
                              onChange={() => void toggleCompletedOption(field, option.id)}
                              type="checkbox"
                            />
                            {option.label}
                          </label>
                        ))}
                        {!field.config.completion && <em>尚未启用完成判断</em>}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {isAddingField && (
                <form className="add-field-form" onSubmit={createField}>
                  <label>
                    字段名称
                    <input
                      autoFocus
                      value={fieldName}
                      onChange={(event) => setFieldName(event.target.value)}
                      placeholder="例如：风险消减措施"
                    />
                  </label>
                  <label>
                    字段类型
                    <select
                      value={fieldType}
                      onChange={(event) => setFieldType(event.target.value as FieldType)}
                    >
                      {fieldTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {optionFieldTypes.has(fieldType) && (
                    <label className="options-input">
                      选项（用逗号分隔）
                      <input
                        value={optionLabels}
                        onChange={(event) => {
                          setOptionLabels(event.target.value);
                          setCompletedOptionIds([]);
                        }}
                        placeholder="未开始, 进行中, 已完成"
                      />
                    </label>
                  )}
                  {fieldType === 'status' && (
                    <div className="new-completion-options">
                      <span>哪些状态代表“已完成”？（可稍后设置）</span>
                      {parseOptionDrafts(optionLabels).map((option) => (
                        <label className="inline-option" key={option.id}>
                          <input
                            checked={completedOptionIds.includes(option.id)}
                            onChange={(event) =>
                              setCompletedOptionIds((current) =>
                                event.target.checked
                                  ? [...current, option.id]
                                  : current.filter((id) => id !== option.id)
                              )
                            }
                            type="checkbox"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="form-actions">
                    <button
                      className="button secondary"
                      onClick={() => setIsAddingField(false)}
                      type="button"
                    >
                      取消
                    </button>
                    <button className="button primary" disabled={isSaving} type="submit">
                      {isSaving ? '正在添加…' : '添加字段'}
                    </button>
                  </div>
                </form>
              )}
            </section>

            <section className="panel preview-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">可编辑数据</span>
                  <h2>数据表</h2>
                  <p>直接在表格中编辑；自动编号由系统分配。</p>
                </div>
                <div className="table-actions">
                  {views.length > 0 && (
                    <select
                      aria-label="当前视图"
                      onChange={(event) => setSelectedViewId(event.target.value)}
                      value={selectedViewId ?? ''}
                    >
                      {views.map((view) => (
                        <option key={view.id} value={view.id}>
                          {view.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedView && (
                    <>
                      <input
                        aria-label="视图名称"
                        onChange={(event) => setViewRenameDraft(event.target.value)}
                        value={viewRenameDraft}
                      />
                      <button
                        className="button tertiary small"
                        disabled={
                          isSaving ||
                          !viewRenameDraft.trim() ||
                          viewRenameDraft === selectedView.name
                        }
                        onClick={() => void renameView()}
                        type="button"
                      >
                        重命名
                      </button>
                      <button
                        className="button tertiary small"
                        disabled={isSaving}
                        onClick={() => void duplicateView()}
                        type="button"
                      >
                        复制视图
                      </button>
                      <button
                        className="button tertiary small danger"
                        disabled={isSaving}
                        onClick={() => void archiveItem('视图', selectedView.id)}
                        type="button"
                      >
                        归档视图
                      </button>
                    </>
                  )}
                  <input
                    aria-label="新视图名称"
                    onChange={(event) => setViewName(event.target.value)}
                    placeholder="新建视图名称"
                    value={viewName}
                  />
                  <button
                    className="button tertiary small"
                    disabled={isSaving || !viewName.trim()}
                    onClick={() => void createView()}
                    type="button"
                  >
                    保存为视图
                  </button>
                  {selectedViewId && (
                    <>
                      <select
                        aria-label="筛选字段"
                        onChange={(event) => {
                          const nextField = detail.fields.find(
                            (field) => field.id === event.target.value
                          );
                          setFilterFieldId(event.target.value);
                          setFilterOperator(defaultFilterOperator(nextField?.type));
                          setFilterValue('');
                        }}
                        value={filterFieldId}
                      >
                        <option value="">筛选字段</option>
                        {detail.fields.map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.name}
                          </option>
                        ))}
                      </select>
                      {filterFieldId && (
                        <>
                          <select
                            aria-label="筛选条件"
                            onChange={(event) =>
                              setFilterOperator(event.target.value as FilterOperator)
                            }
                            value={filterOperator}
                          >
                            {filterOperatorsForField(
                              detail.fields.find((field) => field.id === filterFieldId)?.type
                            ).map((operator) => (
                              <option key={operator} value={operator}>
                                {filterOperatorLabels[operator]}
                              </option>
                            ))}
                          </select>
                          {!filterOperatorNeedsNoValue(filterOperator) && (
                            <FilterValueInput
                              field={detail.fields.find((field) => field.id === filterFieldId)}
                              value={filterValue}
                              onChange={setFilterValue}
                            />
                          )}
                        </>
                      )}
                      <button
                        className="button tertiary small"
                        disabled={isSaving || !filterFieldId}
                        onClick={() => void saveFilter()}
                        type="button"
                      >
                        {filterOperatorNeedsNoValue(filterOperator) || filterValue
                          ? '保存筛选'
                          : '清除筛选'}
                      </button>
                    </>
                  )}
                  {selectedView && (
                    <details className="advanced-filter">
                      <summary>高级筛选</summary>
                      <div className="advanced-filter-popover">
                        <strong>嵌套条件</strong>
                        <FilterExpressionEditor
                          expression={filterExpressionDraft}
                          fields={detail.fields}
                          onChange={setFilterExpressionDraft}
                        />
                        <button
                          className="button primary small"
                          disabled={isSaving}
                          onClick={() => void saveAdvancedFilter()}
                          type="button"
                        >
                          保存高级筛选
                        </button>
                      </div>
                    </details>
                  )}
                  {selectedView && viewConfigDraft && (
                    <details className="view-config">
                      <summary>配置视图</summary>
                      <div className="view-config-popover">
                        <strong>显示字段、顺序与宽度</strong>
                        <div className="view-field-settings">
                          {detail.fields.map((field) => {
                            const visibleIndex = viewConfigDraft.visibleFieldIds.indexOf(field.id);
                            const isVisible = visibleIndex >= 0;
                            return (
                              <div className="view-field-setting" key={field.id}>
                                <label>
                                  <input
                                    checked={isVisible}
                                    onChange={(event) =>
                                      toggleVisibleField(field.id, event.target.checked)
                                    }
                                    type="checkbox"
                                  />
                                  {field.name}
                                </label>
                                {isVisible && (
                                  <>
                                    <input
                                      aria-label={`${field.name}列宽`}
                                      min="60"
                                      onChange={(event) => {
                                        const width = Number(event.target.value);
                                        if (!Number.isFinite(width)) return;
                                        setViewConfigDraft((current) =>
                                          current
                                            ? {
                                                ...current,
                                                fieldWidths: {
                                                  ...current.fieldWidths,
                                                  [field.id]: Math.max(60, Math.min(1200, width))
                                                }
                                              }
                                            : current
                                        );
                                      }}
                                      type="number"
                                      value={viewConfigDraft.fieldWidths[field.id] ?? 160}
                                    />
                                    <button
                                      aria-label={`上移${field.name}`}
                                      className="icon-button"
                                      disabled={visibleIndex === 0}
                                      onClick={() => moveVisibleField(field.id, -1)}
                                      type="button"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      aria-label={`下移${field.name}`}
                                      className="icon-button"
                                      disabled={
                                        visibleIndex === viewConfigDraft.visibleFieldIds.length - 1
                                      }
                                      onClick={() => moveVisibleField(field.id, 1)}
                                      type="button"
                                    >
                                      ↓
                                    </button>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="view-sort-settings">
                          <label>
                            排序字段
                            <select
                              aria-label="排序字段"
                              onChange={(event) =>
                                setViewConfigDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        sorts: event.target.value
                                          ? [
                                              {
                                                fieldId: event.target.value,
                                                direction:
                                                  current.sorts[0]?.direction ?? 'ascending'
                                              }
                                            ]
                                          : []
                                      }
                                    : current
                                )
                              }
                              value={viewConfigDraft.sorts[0]?.fieldId ?? ''}
                            >
                              <option value="">不排序</option>
                              {detail.fields.map((field) => (
                                <option key={field.id} value={field.id}>
                                  {field.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          {viewConfigDraft.sorts[0] && (
                            <label>
                              排序方向
                              <select
                                aria-label="排序方向"
                                onChange={(event) =>
                                  setViewConfigDraft((current) =>
                                    current && current.sorts[0]
                                      ? {
                                          ...current,
                                          sorts: [
                                            {
                                              ...current.sorts[0],
                                              direction: event.target.value as
                                                'ascending' | 'descending'
                                            }
                                          ]
                                        }
                                      : current
                                  )
                                }
                                value={viewConfigDraft.sorts[0].direction}
                              >
                                <option value="ascending">升序</option>
                                <option value="descending">降序</option>
                              </select>
                            </label>
                          )}
                          <button
                            className="button primary small"
                            disabled={isSaving}
                            onClick={() => void saveViewConfiguration()}
                            type="button"
                          >
                            保存视图配置
                          </button>
                        </div>
                      </div>
                    </details>
                  )}
                  <span className="record-count">
                    {(viewRecords ?? detail.records).length} 条记录
                  </span>
                  <button
                    className="button primary small"
                    disabled={isSaving}
                    onClick={() => {
                      setNewRecordValues({});
                      setIsAddingRecord(true);
                    }}
                    type="button"
                  >
                    ＋ 新建记录
                  </button>
                  {selectedDashboardId && selectedViewId && (
                    <button
                      className="button tertiary small"
                      disabled={isSaving}
                      onClick={() => void addViewToDashboard()}
                      type="button"
                    >
                      ＋ 加入看板
                    </button>
                  )}
                </div>
              </div>
              {detail.fields.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {visibleFields.map((field) => (
                          <th
                            key={field.id}
                            style={{ width: selectedView?.config.fieldWidths[field.id] }}
                          >
                            {field.name}
                          </th>
                        ))}
                        <th className="record-action-heading">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isAddingRecord && (
                        <tr className="record-editor-row">
                          {visibleFields.map((field) => (
                            <td
                              key={field.id}
                              style={{ width: selectedView?.config.fieldWidths[field.id] }}
                            >
                              <RecordValueInput
                                field={field}
                                value={newRecordValues[field.id] ?? defaultEditableValue(field)}
                                onChange={(value) =>
                                  setNewRecordValues((current) => ({
                                    ...current,
                                    [field.id]: value
                                  }))
                                }
                              />
                            </td>
                          ))}
                          <td className="record-actions">
                            <button
                              className="button primary small"
                              disabled={isSaving}
                              onClick={() => void createRecord()}
                              type="button"
                            >
                              {isSaving ? '保存中…' : '创建'}
                            </button>
                            <button
                              className="button tertiary small"
                              disabled={isSaving}
                              onClick={() => setIsAddingRecord(false)}
                              type="button"
                            >
                              取消
                            </button>
                          </td>
                        </tr>
                      )}
                      {(viewRecords ?? detail.records).length === 0 ? (
                        <tr>
                          <td className="empty-cell" colSpan={visibleFields.length + 1}>
                            暂无记录。点击“新建记录”开始填写。
                          </td>
                        </tr>
                      ) : (
                        (viewRecords ?? detail.records).map((record) => (
                          <tr key={record.id}>
                            {visibleFields.map((field) => (
                              <td
                                key={field.id}
                                style={{ width: selectedView?.config.fieldWidths[field.id] }}
                              >
                                <RecordValueInput
                                  field={field}
                                  value={
                                    recordValueDrafts[record.id]?.[field.id] ??
                                    toEditableValue(field, record)
                                  }
                                  onChange={(value) =>
                                    setRecordValueDrafts((current) => ({
                                      ...current,
                                      [record.id]: {
                                        ...current[record.id],
                                        [field.id]: value
                                      }
                                    }))
                                  }
                                />
                              </td>
                            ))}
                            <td className="record-actions">
                              <button
                                className="button tertiary small"
                                disabled={isSaving}
                                onClick={() => void updateRecord(record)}
                                type="button"
                              >
                                {isSaving ? '保存中…' : '保存'}
                              </button>
                              <button
                                className="button tertiary small danger"
                                disabled={isSaving}
                                onClick={() => void archiveItem('记录', record.id)}
                                type="button"
                              >
                                归档
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <strong>定义字段后显示数据预览</strong>
                  <span>不同数据库可以拥有不同的字段数量和字段名称。</span>
                </div>
              )}
            </section>
            <section className="panel dashboard-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">纵向报告看板</span>
                  <h2>{dashboardDetail?.dashboard.name ?? '新建看板'}</h2>
                  <p>每个区块引用独立视图；更改一个视图不会改动其他区块。</p>
                </div>
                <div className="table-actions">
                  {dashboards.length > 0 && (
                    <select
                      aria-label="当前看板"
                      value={selectedDashboardId ?? ''}
                      onChange={(event) => setSelectedDashboardId(event.target.value)}
                    >
                      {dashboards.map((dashboard) => (
                        <option key={dashboard.id} value={dashboard.id}>
                          {dashboard.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    aria-label="新看板名称"
                    placeholder="新看板名称"
                    value={dashboardName}
                    onChange={(event) => setDashboardName(event.target.value)}
                  />
                  <button
                    className="button tertiary small"
                    disabled={isSaving || !dashboardName.trim()}
                    onClick={() => void createDashboard()}
                    type="button"
                  >
                    新建看板
                  </button>
                  {selectedDashboardId && (
                    <>
                      <input
                        aria-label="报告标题"
                        onChange={(event) => setReportTitle(event.target.value)}
                        placeholder="报告标题（默认看板名）"
                        value={reportTitle}
                      />
                      <input
                        aria-label="报告周期"
                        onChange={(event) => setReportPeriod(event.target.value)}
                        placeholder="例如：2026年第32周"
                        value={reportPeriod}
                      />
                      <select
                        aria-label="报告密度"
                        onChange={(event) =>
                          setReportDensity(event.target.value as 'compact' | 'comfortable')
                        }
                        value={reportDensity}
                      >
                        <option value="comfortable">舒适间距</option>
                        <option value="compact">紧凑间距</option>
                      </select>
                      <label className="inline-option">
                        <input
                          checked={includeEmptySections}
                          onChange={(event) => setIncludeEmptySections(event.target.checked)}
                          type="checkbox"
                        />
                        包含空模块
                      </label>
                      <label className="inline-option">
                        <input
                          checked={includeCompleted}
                          onChange={(event) => setIncludeCompleted(event.target.checked)}
                          type="checkbox"
                        />
                        包含已完成事项
                      </label>
                      <label className="inline-option">
                        <input
                          checked={highlightReportStatus}
                          onChange={(event) => setHighlightReportStatus(event.target.checked)}
                          type="checkbox"
                        />
                        高亮状态
                      </label>
                      <button
                        className="button primary small"
                        disabled={isSaving}
                        onClick={() => void previewReport()}
                        type="button"
                      >
                        静态报告预览
                      </button>
                      <button
                        className="button secondary small"
                        disabled={isSaving}
                        onClick={() => void downloadEditableWorkbook()}
                        type="button"
                      >
                        下载可编辑 Excel
                      </button>
                      <button
                        className="button secondary small"
                        disabled={isSaving}
                        onClick={() => void downloadPresentationWorkbook()}
                        type="button"
                      >
                        下载展示版 Excel
                      </button>
                      <button
                        className="button primary small"
                        disabled={isSaving}
                        onClick={() => void createOutlookDraft()}
                        type="button"
                      >
                        创建 Outlook 草稿
                      </button>
                      <button
                        className="button secondary small"
                        disabled={isSaving}
                        onClick={() => void copyOutlookReport()}
                        type="button"
                      >
                        复制邮件内容
                      </button>
                      <button
                        className="button secondary small"
                        disabled={isSaving}
                        onClick={downloadOutlookHtml}
                        type="button"
                      >
                        下载 Outlook HTML
                      </button>
                    </>
                  )}
                </div>
              </div>
              {dashboardDetail?.blocks.length ? (
                <div className="dashboard-blocks">
                  {dashboardDetail.blocks.map((block, index) => (
                    <article className="dashboard-block" key={block.id}>
                      <div className="dashboard-block-heading">
                        <h3>{block.titleOverride ?? block.view.view.name}</h3>
                        <div className="table-actions">
                          <button
                            className="button tertiary small"
                            disabled={isSaving}
                            onClick={() =>
                              void updateDashboardBlock(block.id, {
                                isCollapsed: !block.isCollapsed
                              })
                            }
                            type="button"
                          >
                            {block.isCollapsed ? '展开' : '折叠'}
                          </button>
                          <button
                            className="button tertiary small"
                            disabled={isSaving}
                            onClick={() =>
                              void updateDashboardBlock(block.id, {
                                includeInExport: !block.includeInExport
                              })
                            }
                            type="button"
                          >
                            {block.includeInExport ? '纳入导出' : '不纳入导出'}
                          </button>
                          <button
                            className="button tertiary small"
                            disabled={isSaving || index === 0}
                            onClick={() =>
                              void updateDashboardBlock(block.id, {
                                sortOrder: dashboardDetail.blocks[index - 1]!.sortOrder - 1
                              })
                            }
                            type="button"
                          >
                            上移
                          </button>
                        </div>
                      </div>
                      <input
                        aria-label={`${block.view.view.name}区块标题`}
                        defaultValue={block.titleOverride ?? ''}
                        placeholder="自定义区块标题（可选）"
                        onBlur={(event) => {
                          if (event.target.value !== (block.titleOverride ?? ''))
                            void updateDashboardBlock(block.id, {
                              titleOverride: event.target.value
                            });
                        }}
                      />
                      {block.description && <p>{block.description}</p>}
                      {!block.isCollapsed && (
                        <table>
                          <thead>
                            <tr>
                              {block.view.fields
                                .filter((field) =>
                                  block.view.view.config.visibleFieldIds.includes(field.id)
                                )
                                .map((field) => (
                                  <th key={field.id}>{field.name}</th>
                                ))}
                            </tr>
                          </thead>
                          <tbody>
                            {block.view.records.map((record) => (
                              <tr key={record.id}>
                                {block.view.fields
                                  .filter((field) =>
                                    block.view.view.config.visibleFieldIds.includes(field.id)
                                  )
                                  .map((field) => (
                                    <td key={field.id}>{displayReadOnlyValue(field, record)}</td>
                                  ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>看板还没有区块</strong>
                  <span>选择一个保存视图后点击“加入看板”。</span>
                </div>
              )}
              {reportPreviewHtml && (
                <div className="report-preview">
                  <div className="dashboard-block-heading">
                    <h3>静态报告预览</h3>
                    <button
                      className="button tertiary small"
                      onClick={() => setReportPreviewHtml('')}
                      type="button"
                    >
                      关闭预览
                    </button>
                  </div>
                  <iframe sandbox="" srcDoc={reportPreviewHtml} title="静态报告预览" />
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="first-run">
            <span className="first-run-icon">＋</span>
            <h2>从一个业务数据库开始</h2>
            <p>
              例如“需求跟踪”可拥有需求名称、交付计划和责任人；“关键风险”则可拥有风险描述和风险消减措施。
            </p>
            <button
              className="button primary"
              onClick={() => setIsCreatingDatabase(true)}
              type="button"
            >
              创建第一个数据库
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers }
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      { message?: string } | undefined;
    throw new Error(payload?.message ?? `请求失败（${response.status}）`);
  }
  return (await response.json()) as T;
}

function readRequestError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function parseOptionDrafts(value: string): Array<{ id: string; label: string }> {
  return value
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label, index) => ({ id: `option-${index + 1}`, label }));
}

function defaultEditableValue(field: Field): EditableValue {
  if (field.type === 'checkbox') return false;
  if (field.type === 'multi_select') return [];
  return '';
}

function toEditableValue(field: Field, record: RecordRow): EditableValue {
  if (field.type === 'sequence') return String(record.sequenceNumber);
  const value = record.values[field.id];
  if (value === undefined || value === null) return defaultEditableValue(field);
  if (Array.isArray(value)) return value;
  if (typeof value === 'boolean') return value;
  return String(value);
}

function displayReadOnlyValue(field: Field, record: RecordRow): string {
  if (field.type === 'sequence') return String(record.sequenceNumber);
  const value = record.values[field.id];
  if (value === undefined || value === null) return '';
  if (field.type === 'single_select' || field.type === 'status') {
    return field.config.options?.find((option) => option.id === value)?.label ?? String(value);
  }
  if (field.type === 'multi_select' && Array.isArray(value)) {
    return value
      .map(
        (optionId) =>
          field.config.options?.find((option) => option.id === optionId)?.label ?? optionId
      )
      .join(', ');
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

function serializeRecordValues(
  fields: Field[],
  drafts: Record<string, EditableValue>
): Record<string, unknown> {
  const entries: Array<[string, unknown]> = [];
  for (const field of fields) {
    if (field.type === 'sequence') continue;
    const value = drafts[field.id] ?? defaultEditableValue(field);
    if (value === '' || (Array.isArray(value) && value.length === 0)) continue;
    entries.push([field.id, field.type === 'number' ? Number(value) : value]);
  }
  return Object.fromEntries(entries);
}

const filterOperatorLabels: Record<FilterOperator, string> = {
  equals: '等于',
  not_equals: '不等于',
  contains: '包含',
  not_contains: '不包含',
  greater_than: '大于',
  greater_or_equal: '大于等于',
  less_than: '小于',
  less_or_equal: '小于等于',
  before: '早于',
  after: '晚于',
  on_or_before: '不晚于',
  on_or_after: '不早于',
  between: '介于',
  is_any_of: '是任一项',
  is_none_of: '不是任一项',
  contains_any: '包含任一项',
  contains_all: '包含全部',
  contains_none: '不包含任一项',
  is_checked: '已勾选',
  is_not_checked: '未勾选',
  is_empty: '为空',
  is_not_empty: '不为空'
};

function filterOperatorsForField(type: FieldType | undefined): FilterOperator[] {
  switch (type) {
    case 'short_text':
    case 'long_text':
    case 'person':
    case 'url':
      return ['contains', 'not_contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'];
    case 'number':
    case 'sequence':
      return [
        'equals',
        'not_equals',
        'greater_than',
        'greater_or_equal',
        'less_than',
        'less_or_equal',
        'is_empty',
        'is_not_empty'
      ];
    case 'date':
      return [
        'equals',
        'not_equals',
        'before',
        'after',
        'on_or_before',
        'on_or_after',
        'is_empty',
        'is_not_empty'
      ];
    case 'single_select':
    case 'status':
      return ['equals', 'not_equals', 'is_empty', 'is_not_empty'];
    case 'multi_select':
      return ['contains_any', 'contains_none', 'is_empty', 'is_not_empty'];
    case 'checkbox':
      return ['is_checked', 'is_not_checked'];
    default:
      return [];
  }
}

function defaultFilterOperator(type: FieldType | undefined): FilterOperator {
  return filterOperatorsForField(type)[0] ?? 'contains';
}

function filterOperatorNeedsNoValue(operator: FilterOperator): boolean {
  return ['is_empty', 'is_not_empty', 'is_checked', 'is_not_checked'].includes(operator);
}

function buildFilterCondition(
  fieldId: string,
  operator: FilterOperator,
  rawValue: string
): FilterCondition | null {
  if (!fieldId) return null;
  if (filterOperatorNeedsNoValue(operator)) return { kind: 'condition', fieldId, operator };
  if (!rawValue) return null;
  const value = [
    'is_any_of',
    'is_none_of',
    'contains_any',
    'contains_all',
    'contains_none'
  ].includes(operator)
    ? [rawValue]
    : operator === 'greater_than' ||
        operator === 'greater_or_equal' ||
        operator === 'less_than' ||
        operator === 'less_or_equal'
      ? Number(rawValue)
      : rawValue;
  return { kind: 'condition', fieldId, operator, value };
}

function FilterValueInput({
  field,
  value,
  onChange
}: {
  field: Field | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  if (
    field?.type === 'single_select' ||
    field?.type === 'status' ||
    field?.type === 'multi_select'
  ) {
    return (
      <select
        aria-label="筛选内容"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">选择值…</option>
        {field.config.options?.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      aria-label="筛选内容"
      onChange={(event) => onChange(event.target.value)}
      placeholder="筛选值…"
      type={
        field?.type === 'number' || field?.type === 'sequence'
          ? 'number'
          : field?.type === 'date'
            ? 'date'
            : 'text'
      }
      value={value}
    />
  );
}

function newFilterCondition(fields: Field[]): FilterCondition {
  const field = fields[0];
  return {
    kind: 'condition',
    fieldId: field?.id ?? '',
    operator: defaultFilterOperator(field?.type),
    value: field?.type === 'number' || field?.type === 'sequence' ? 0 : ''
  };
}

function FilterExpressionEditor({
  expression,
  fields,
  onChange
}: {
  expression: FilterExpression | null;
  fields: Field[];
  onChange: (expression: FilterExpression | null) => void;
}) {
  if (!expression) {
    return (
      <div className="filter-empty-actions">
        <button
          className="button tertiary small"
          onClick={() => onChange(newFilterCondition(fields))}
          type="button"
        >
          ＋ 条件
        </button>
        <button
          className="button tertiary small"
          onClick={() =>
            onChange({ kind: 'group', conjunction: 'and', children: [newFilterCondition(fields)] })
          }
          type="button"
        >
          ＋ 条件组
        </button>
      </div>
    );
  }
  return (
    <FilterExpressionNode
      fields={fields}
      node={expression}
      onChange={onChange}
      onRemove={() => onChange(null)}
    />
  );
}

function FilterExpressionNode({
  node,
  fields,
  onChange,
  onRemove
}: {
  node: FilterExpression;
  fields: Field[];
  onChange: (node: FilterExpression) => void;
  onRemove: () => void;
}) {
  if (node.kind === 'group') {
    return (
      <div className="filter-group">
        <div className="filter-group-heading">
          <select
            aria-label="条件组关系"
            onChange={(event) =>
              onChange({ ...node, conjunction: event.target.value as 'and' | 'or' })
            }
            value={node.conjunction}
          >
            <option value="and">同时满足（AND）</option>
            <option value="or">满足任一（OR）</option>
          </select>
          <button className="button tertiary small danger" onClick={onRemove} type="button">
            删除组
          </button>
        </div>
        {node.children.map((child, index) => (
          <FilterExpressionNode
            fields={fields}
            key={index}
            node={child}
            onChange={(next) =>
              onChange({
                ...node,
                children: node.children.map((item, itemIndex) =>
                  itemIndex === index ? next : item
                )
              })
            }
            onRemove={() =>
              onChange({
                ...node,
                children: node.children.filter((_, itemIndex) => itemIndex !== index)
              })
            }
          />
        ))}
        <div className="filter-empty-actions">
          <button
            className="button tertiary small"
            onClick={() =>
              onChange({ ...node, children: [...node.children, newFilterCondition(fields)] })
            }
            type="button"
          >
            ＋ 条件
          </button>
          <button
            className="button tertiary small"
            onClick={() =>
              onChange({
                ...node,
                children: [
                  ...node.children,
                  { kind: 'group', conjunction: 'and', children: [newFilterCondition(fields)] }
                ]
              })
            }
            type="button"
          >
            ＋ 条件组
          </button>
        </div>
      </div>
    );
  }
  const field = fields.find((item) => item.id === node.fieldId);
  const value = Array.isArray(node.value) ? String(node.value[0] ?? '') : String(node.value ?? '');
  return (
    <div className="filter-condition">
      <select
        aria-label="高级筛选字段"
        onChange={(event) => {
          const nextField = fields.find((item) => item.id === event.target.value);
          onChange(newFilterCondition(nextField ? [nextField] : []));
        }}
        value={node.fieldId}
      >
        {fields.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select
        aria-label="高级筛选条件"
        onChange={(event) => onChange({ ...node, operator: event.target.value as FilterOperator })}
        value={node.operator}
      >
        {filterOperatorsForField(field?.type).map((operator) => (
          <option key={operator} value={operator}>
            {filterOperatorLabels[operator]}
          </option>
        ))}
      </select>
      {!filterOperatorNeedsNoValue(node.operator) && (
        <FilterValueInput
          field={field}
          value={value}
          onChange={(rawValue) => {
            const next = buildFilterCondition(node.fieldId, node.operator, rawValue);
            if (next) onChange(next);
          }}
        />
      )}
      <button className="button tertiary small danger" onClick={onRemove} type="button">
        删除
      </button>
    </div>
  );
}

function RecordValueInput({
  field,
  value,
  onChange
}: {
  field: Field;
  value: EditableValue;
  onChange: (value: EditableValue) => void;
}) {
  if (field.type === 'sequence') {
    return <span className="sequence-value">{value || '自动'}</span>;
  }
  if (field.type === 'checkbox') {
    return (
      <input
        aria-label={field.name}
        checked={value === true}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    );
  }
  if (field.type === 'multi_select') {
    return (
      <select
        aria-label={field.name}
        multiple
        onChange={(event) =>
          onChange(Array.from(event.target.selectedOptions, (option) => option.value))
        }
        value={Array.isArray(value) ? value : []}
      >
        {field.config.options?.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'single_select' || field.type === 'status') {
    return (
      <select
        aria-label={field.name}
        onChange={(event) => onChange(event.target.value)}
        value={String(value)}
      >
        <option value="">未选择</option>
        {field.config.options?.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'long_text') {
    return (
      <textarea
        aria-label={field.name}
        onChange={(event) => onChange(event.target.value)}
        value={String(value)}
      />
    );
  }
  return (
    <input
      aria-label={field.name}
      onChange={(event) => onChange(event.target.value)}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={String(value)}
    />
  );
}
