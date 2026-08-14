import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject
} from 'react';
import { createPortal } from 'react-dom';
import type { FieldType, ViewConfig } from '@project-manager/domain';

type PrototypeColumnType = 'sequence' | 'text' | 'person' | 'date' | 'status' | 'number';

type PrototypeColumn = {
  id: string;
  name: string;
  type: PrototypeColumnType;
  width: number;
  options?: string[];
  optionValues?: Array<{ id: string; label: string }>;
  reportAlign?: 'left' | 'center';
  reportEmphasis?: 'strong';
};

type PrototypeRow = {
  id: string;
  values: Record<string, string>;
};

type PrototypeFilter = {
  columnId: string;
  operator: 'contains' | 'equals';
  keyword: string;
};

type PrototypeTable = {
  id: string;
  name: string;
  icon: string;
  columns: PrototypeColumn[];
  rows: PrototypeRow[];
  filter?: PrototypeFilter;
};

type PrototypePageBlock =
  | { id: string; kind: 'table'; tableId: string }
  | { id: string; kind: 'text'; title: string; content: string }
  | {
      id: string;
      kind: 'image';
      title: string;
      src?: string;
      fileName?: string;
      caption: string;
    };

type ServerField = {
  id: string;
  name: string;
  type: FieldType;
  config: {
    options?: Array<{ id: string; label: string }>;
    completion?: { completedOptionIds: string[] };
  };
};
type ServerRecord = { id: string; sequenceNumber: number; values: Record<string, unknown> };
type ServerTableBlock = {
  id: string;
  kind: 'table_view';
  view: {
    view: { id: string; config: ViewConfig };
    database: { id: string; name: string };
    fields: ServerField[];
    records: ServerRecord[];
  };
};
type ServerContentBlock =
  | { id: string; kind: 'text'; config: { title: string; body: string } }
  | {
      id: string;
      kind: 'image';
      config: { title: string | null; caption: string | null };
      asset: { contentUrl: string; originalFilename: string } | null;
    };
type ServerDashboard = {
  dashboard: { id: string; name: string };
  blocks: Array<ServerTableBlock | ServerContentBlock>;
};

type PopoverState =
  | { kind: 'column'; anchor: HTMLElement; tableId: string; columnId: string }
  | { kind: 'filter'; anchor: HTMLElement; tableId: string }
  | { kind: 'table'; anchor: HTMLElement; tableId: string }
  | { kind: 'row'; anchor: HTMLElement; tableId: string; rowId: string }
  | { kind: 'content'; anchor: HTMLElement; blockId: string }
  | { kind: 'export'; anchor: HTMLElement }
  | { kind: 'settings'; anchor: HTMLElement }
  | { kind: 'add-module'; anchor: HTMLElement };

type RestoreInspection = {
  restoreId: string;
  manifest: {
    createdAt: string;
    applicationVersion: string;
    database: { bytes: number; migrations: { appliedCount: number; totalCount: number } };
    workspace: { name: string } | null;
  };
};

type RuntimeDiagnostics = {
  application: {
    version: string;
    nodeVersion: string;
    platform: string;
    architecture: string;
    loopbackAddress: string;
  };
  storage: {
    dataDirectory: string;
    database: { healthy: boolean };
    migration: { appliedCount: number; pendingCount: number; totalCount: number };
    latestAutomaticBackup?: { kind: string; createdAt: string; bytes: number };
    availableBytes?: number;
  };
  outlook: { available: boolean; reason?: string };
};

type DestructiveConfirmation = 'column' | 'table' | 'row' | 'content';

type PreviewMode = 'report' | 'excel';

type BlockDropTarget = {
  blockId: string;
  edge: 'before' | 'after';
};

type ExportSettings = {
  title: string;
  period: string;
  includeCompleted: boolean;
  includeEmpty: boolean;
};

const typeOptions: Array<{ value: PrototypeColumnType; label: string; icon: string }> = [
  { value: 'text', label: '文本', icon: 'Aa' },
  { value: 'number', label: '数字', icon: '#' },
  { value: 'date', label: '日期', icon: '◷' },
  { value: 'status', label: '状态', icon: '●' },
  { value: 'person', label: '人员', icon: '人' },
  { value: 'sequence', label: '自动编号', icon: '#' }
];

function currentWeekPlaceholder(): string {
  const now = new Date();
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getUTCDay() + 1) / 7
  );
  return `例如：${now.getUTCFullYear()} 年第 ${week} 周`;
}

export function PrototypeV2() {
  const [tables, setTables] = useState<PrototypeTable[]>([]);
  const [pageBlocks, setPageBlocks] = useState<PrototypePageBlock[]>([]);
  const [dashboardId, setDashboardId] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const tablesRef = useRef<PrototypeTable[]>([]);
  const [popover, setPopover] = useState<PopoverState>();
  const [propertyDraft, setPropertyDraft] = useState<PrototypeColumn>();
  const [filterDraft, setFilterDraft] = useState<PrototypeFilter>({
    columnId: '',
    operator: 'contains',
    keyword: ''
  });
  const [newTableName, setNewTableName] = useState('');
  const [moduleComposer, setModuleComposer] = useState<'table'>();
  const [destructiveConfirmation, setDestructiveConfirmation] = useState<DestructiveConfirmation>();
  const [blankRowDrafts, setBlankRowDrafts] = useState<Record<string, Record<string, string>>>({});
  const [draggingColumn, setDraggingColumn] = useState<{ tableId: string; columnId: string }>();
  const [draggingBlockId, setDraggingBlockId] = useState<string>();
  const [blockDropTarget, setBlockDropTarget] = useState<BlockDropTarget>();
  const [resizingColumn, setResizingColumn] = useState<{ tableId: string; columnId: string }>();
  const [previewMode, setPreviewMode] = useState<PreviewMode>();
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    title: '项目工作台',
    period: '',
    includeCompleted: true,
    includeEmpty: true
  });
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const [restoreInspection, setRestoreInspection] = useState<RestoreInspection>();
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restoreReplacementConfirmed, setRestoreReplacementConfirmed] = useState(false);
  const [restoreRestartRequired, setRestoreRestartRequired] = useState(false);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics>();
  const popoverRef = useRef<HTMLDivElement>(null);

  const closePopover = () => {
    setPopover(undefined);
    setPropertyDraft(undefined);
    setDestructiveConfirmation(undefined);
    setModuleComposer(undefined);
  };

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  async function refreshWorkspace() {
    try {
      const next = await api<ServerDashboard>('/api/workspace/primary-dashboard', {
        method: 'POST'
      });
      setDashboardId(next.dashboard.id);
      const nextTables = next.blocks.flatMap((block) => {
        if (block.kind !== 'table_view') return [];
        const { database, fields, records, view } = block.view;
        return [
          {
            id: database.id,
            name: database.name,
            icon: '▤',
            columns: view.config.visibleFieldIds.flatMap((fieldId) => {
              const field = fields.find((candidate) => candidate.id === fieldId);
              return field
                ? [
                    {
                      id: field.id,
                      name: field.name,
                      type: toPrototypeColumnType(field.type),
                      width: view.config.fieldWidths?.[field.id] ?? defaultWidth(field.type),
                      options: field.config.options?.map((option) => option.label),
                      optionValues: field.config.options?.map((option) => ({ ...option })),
                      reportAlign:
                        view.config.fieldPresentation?.[field.id]?.reportAlign === 'center'
                          ? ('center' as const)
                          : undefined,
                      reportEmphasis:
                        view.config.fieldPresentation?.[field.id]?.reportEmphasis === 'strong'
                          ? ('strong' as const)
                          : undefined
                    }
                  ]
                : [];
            }),
            rows: records.map((record) => ({
              id: record.id,
              values: Object.fromEntries(
                Object.entries(record.values).map(([fieldId, value]) => {
                  const field = fields.find((candidate) => candidate.id === fieldId);
                  const option = field?.config.options?.find((candidate) => candidate.id === value);
                  return [
                    fieldId,
                    option?.label ??
                      (Array.isArray(value)
                        ? value.join('，')
                        : value === undefined || value === null
                          ? ''
                          : String(value))
                  ];
                })
              )
            })),
            filter: deserializeFilter(view.config.filter, fields)
          }
        ];
      });
      setTables(nextTables);
      tablesRef.current = nextTables;
      setPageBlocks(
        next.blocks.map((block) => {
          if (block.kind === 'table_view')
            return { id: block.id, kind: 'table', tableId: block.view.database.id };
          if (block.kind === 'text')
            return {
              id: block.id,
              kind: 'text',
              title: block.config.title,
              content: block.config.body
            };
          return {
            id: block.id,
            kind: 'image',
            title: block.config.title ?? '',
            caption: block.config.caption ?? '',
            src: block.asset?.contentUrl,
            fileName: block.asset?.originalFilename
          };
        })
      );
      setLoadError(undefined);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '无法载入本地工作台。');
    }
  }

  function tableBlockId(tableId: string) {
    return pageBlocks.find((block) => block.kind === 'table' && block.tableId === tableId)?.id;
  }

  async function saveTableView(tableId: string, override?: PrototypeTable) {
    const table = override ?? tablesRef.current.find((candidate) => candidate.id === tableId);
    if (!table) return;
    const block = pageBlocks.find(
      (candidate) => candidate.kind === 'table' && candidate.tableId === tableId
    );
    if (!block || block.kind !== 'table') return;
    const server = dashboardId
      ? await api<ServerDashboard>(`/api/dashboards/${dashboardId}`)
      : await api<ServerDashboard>('/api/workspace/primary-dashboard', { method: 'POST' });
    const tableBlock = server.blocks.find(
      (candidate): candidate is ServerTableBlock =>
        candidate.kind === 'table_view' && candidate.id === block.id
    );
    if (!tableBlock) return;
    const config: ViewConfig = {
      version: 1,
      visibleFieldIds: table.columns.map((column) => column.id),
      fieldWidths: Object.fromEntries(table.columns.map((column) => [column.id, column.width])),
      fieldPresentation: Object.fromEntries(
        table.columns.flatMap((column) =>
          column.reportAlign || column.reportEmphasis
            ? [
                [
                  column.id,
                  { reportAlign: column.reportAlign, reportEmphasis: column.reportEmphasis }
                ]
              ]
            : []
        )
      ),
      filter: serializeFilter(table),
      sorts: [],
      includeArchived: false
    };
    await api(`/api/views/${tableBlock.view.view.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ config })
    });
  }

  useEffect(() => {
    if (!popover) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (popover.anchor.contains(event.target) || popoverRef.current?.contains(event.target))
        return;
      closePopover();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePopover();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [popover]);

  const visibleTables = useMemo(
    () =>
      tables.map((table) => ({
        ...table,
        visibleRows: filterRows(table)
      })),
    [tables]
  );

  function updateTable(tableId: string, update: (table: PrototypeTable) => PrototypeTable) {
    setTables((current) => {
      const next = current.map((table) => (table.id === tableId ? update(table) : table));
      tablesRef.current = next;
      return next;
    });
  }

  function openColumnEditor(table: PrototypeTable, column: PrototypeColumn, anchor: HTMLElement) {
    setDestructiveConfirmation(undefined);
    setPropertyDraft({ ...column, options: column.options ? [...column.options] : undefined });
    setPopover({ kind: 'column', anchor, tableId: table.id, columnId: column.id });
  }

  async function saveColumnProperty() {
    if (!popover || popover.kind !== 'column' || !propertyDraft?.name.trim()) return;
    const table = tables.find((candidate) => candidate.id === popover.tableId);
    const original = table?.columns.find((column) => column.id === popover.columnId);
    if (!table || !original) return;
    const type = toServerFieldType(propertyDraft.type);
    const options =
      propertyDraft.type === 'status'
        ? (propertyDraft.options ?? []).map((label, index) => ({
            id:
              original.optionValues?.find((option) => option.label === label)?.id ??
              original.optionValues?.[index]?.id ??
              crypto.randomUUID(),
            label
          }))
        : undefined;
    updateTable(popover.tableId, (table) => ({
      ...table,
      columns: table.columns.map((column) =>
        column.id === popover.columnId
          ? { ...propertyDraft, name: propertyDraft.name.trim() }
          : column
      )
    }));
    try {
      await api(`/api/fields/${original.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: propertyDraft.name.trim(),
          type,
          config: options
            ? {
                version: 1,
                options,
                completion: { completedOptionIds: options.slice(-1).map((option) => option.id) }
              }
            : { version: 1 }
        })
      });
      await saveTableView(table.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存属性失败。');
      await refreshWorkspace();
      return;
    }
    setNotice(`已更新属性“${propertyDraft.name.trim()}”`);
    closePopover();
  }

  async function deleteColumn(tableId: string, columnId: string) {
    const columnName = tables
      .find((table) => table.id === tableId)
      ?.columns.find((column) => column.id === columnId)?.name;
    updateTable(tableId, (table) => ({
      ...table,
      columns: table.columns.filter((column) => column.id !== columnId),
      filter: table.filter?.columnId === columnId ? undefined : table.filter,
      rows: table.rows.map((row) => {
        const values = { ...row.values };
        delete values[columnId];
        return { ...row, values };
      })
    }));
    setBlankRowDrafts((current) => {
      const next = { ...current, [tableId]: { ...current[tableId] } };
      delete next[tableId]![columnId];
      return next;
    });
    setNotice(`已删除属性“${columnName ?? '未命名属性'}”`);
    closePopover();
    try {
      await api(`/api/fields/${columnId}/archive`, { method: 'POST' });
      await refreshWorkspace();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除属性失败。');
      await refreshWorkspace();
    }
  }

  async function duplicateTable(tableId: string) {
    const blockId = tableBlockId(tableId);
    if (!blockId) return;
    try {
      await api(`/api/dashboard-blocks/${blockId}/duplicate-table`, { method: 'POST' });
      await refreshWorkspace();
      setNotice('已复制表格，副本保留列结构和当前记录。');
      closePopover();
      return;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '复制表格失败。');
      return;
    }
  }

  async function deleteTable(tableId: string) {
    const tableName = tables.find((table) => table.id === tableId)?.name;
    setTables((current) => current.filter((table) => table.id !== tableId));
    setPageBlocks((current) =>
      current.filter((block) => block.kind !== 'table' || block.tableId !== tableId)
    );
    setBlankRowDrafts((current) => {
      const next = { ...current };
      delete next[tableId];
      return next;
    });
    setNotice(`已删除表格“${tableName ?? '未命名表格'}”`);
    closePopover();
    const blockId = tableBlockId(tableId);
    if (!blockId) return;
    try {
      await api(`/api/dashboard-blocks/${blockId}/archive`, { method: 'POST' });
      await refreshWorkspace();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除表格失败。');
      await refreshWorkspace();
    }
  }

  async function duplicateRow(tableId: string, rowId: string) {
    updateTable(tableId, (table) => {
      const rowIndex = table.rows.findIndex((row) => row.id === rowId);
      if (rowIndex < 0) return table;
      const rows = [...table.rows];
      rows.splice(rowIndex + 1, 0, {
        id: `row-${crypto.randomUUID()}`,
        values: { ...rows[rowIndex]!.values }
      });
      return { ...table, rows };
    });
    setNotice('已复制记录。');
    closePopover();
    try {
      await api(`/api/records/${rowId}/duplicate`, { method: 'POST' });
      await refreshWorkspace();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '复制记录失败。');
      await refreshWorkspace();
    }
  }

  async function deleteRow(tableId: string, rowId: string) {
    updateTable(tableId, (table) => ({
      ...table,
      rows: table.rows.filter((row) => row.id !== rowId)
    }));
    setNotice('已删除记录。');
    closePopover();
    try {
      await api(`/api/records/${rowId}/archive`, { method: 'POST' });
      await refreshWorkspace();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除记录失败。');
      await refreshWorkspace();
    }
  }

  function openFilter(table: PrototypeTable, anchor: HTMLElement) {
    const firstColumn = table.columns.find((column) => column.type !== 'sequence');
    setFilterDraft(
      table.filter ?? {
        columnId: firstColumn?.id ?? '',
        operator: filterOperatorForColumn(firstColumn),
        keyword: ''
      }
    );
    setPopover({ kind: 'filter', anchor, tableId: table.id });
  }

  async function applyFilter(tableId: string) {
    const table = tablesRef.current.find((candidate) => candidate.id === tableId);
    if (!table) return;
    const next: PrototypeTable = {
      ...table,
      filter: filterDraft.keyword.trim()
        ? { ...filterDraft, keyword: filterDraft.keyword.trim() }
        : undefined
    };
    updateTable(tableId, () => next);
    try {
      await saveTableView(tableId, next);
      closePopover();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存筛选失败。');
      await refreshWorkspace();
    }
  }

  async function clearFilter(tableId: string) {
    const table = tablesRef.current.find((candidate) => candidate.id === tableId);
    if (!table) return;
    const next: PrototypeTable = { ...table, filter: undefined };
    updateTable(tableId, () => next);
    try {
      await saveTableView(tableId, next);
      closePopover();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '清除筛选失败。');
      await refreshWorkspace();
    }
  }

  async function addTable() {
    const name = newTableName.trim();
    if (!name) return;
    try {
      const block = await api<ServerTableBlock>('/api/workspace/tables', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      await refreshWorkspace();
      setNewTableName('');
      closePopover();
      requestAnimationFrame(() =>
        document.getElementById(block.view.database.id)?.scrollIntoView({ behavior: 'smooth' })
      );
      return;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '新建表格失败。');
      return;
    }
  }

  async function addTextBlock() {
    try {
      await api('/api/workspace/content-blocks', {
        method: 'POST',
        body: JSON.stringify({ kind: 'text', config: { version: 1, title: '本周摘要', body: '' } })
      });
      await refreshWorkspace();
      setNotice('已添加文字模块。');
      closePopover();
      return;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '添加文字模块失败。');
      return;
    }
  }

  async function addImageBlock() {
    try {
      await api('/api/workspace/content-blocks', {
        method: 'POST',
        body: JSON.stringify({ kind: 'image', config: { version: 1, title: null, caption: null } })
      });
      await refreshWorkspace();
      setNotice('已添加图片模块，请从本机选择图片。');
      closePopover();
      return;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '添加图片模块失败。');
      return;
    }
  }

  function updatePageBlock(
    blockId: string,
    update: (block: PrototypePageBlock) => PrototypePageBlock
  ) {
    setPageBlocks((current) =>
      current.map((block) => (block.id === blockId ? update(block) : block))
    );
  }

  async function saveContentBlock(blockId: string) {
    const block = pageBlocks.find((candidate) => candidate.id === blockId);
    if (!block || block.kind === 'table') return;
    const config =
      block.kind === 'text'
        ? { version: 1, title: block.title, body: block.content }
        : { version: 1, title: block.title.trim() || null, caption: block.caption.trim() || null };
    try {
      await api(`/api/dashboard-blocks/${blockId}`, {
        method: 'PATCH',
        body: JSON.stringify({ config })
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存模块失败。');
    }
  }

  function reportQuery() {
    const query = new URLSearchParams();
    if (exportSettings.title.trim()) query.set('title', exportSettings.title.trim());
    if (exportSettings.period.trim()) query.set('period', exportSettings.period.trim());
    query.set('includeCompleted', String(exportSettings.includeCompleted));
    query.set('includeEmptySections', String(exportSettings.includeEmpty));
    query.set('highlightStatus', 'true');
    query.set('density', 'comfortable');
    return query.toString();
  }

  async function prepareReportExport() {
    await Promise.all([
      ...tables.flatMap((table) => [
        api(`/api/databases/${table.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: table.name.trim() || '未命名表格' })
        }),
        saveTableView(table.id, table),
        ...table.rows.map((row) =>
          api(`/api/records/${row.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ values: serializeValues(table, row.values) })
          })
        )
      ]),
      ...pageBlocks.flatMap((block) => {
        if (block.kind === 'table') return [];
        const config =
          block.kind === 'text'
            ? { version: 1, title: block.title, body: block.content }
            : {
                version: 1,
                title: block.title.trim() || null,
                caption: block.caption.trim() || null
              };
        return [
          api(`/api/dashboard-blocks/${block.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ config })
          })
        ];
      })
    ]);
  }

  async function runExport(action: () => Promise<void>, successMessage: string) {
    if (!dashboardId || isExporting) return;
    setIsExporting(true);
    try {
      await prepareReportExport();
      await action();
      setNotice(successMessage);
      closePopover();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '导出失败。');
    } finally {
      setIsExporting(false);
    }
  }

  async function downloadWorkbook(kind: 'editable' | 'presentation') {
    await runExport(
      async () => {
        const response = await fetch(
          `/api/dashboards/${dashboardId}/export/${kind}.xlsx?${reportQuery()}`
        );
        if (!response.ok) throw new Error(await responseError(response, '导出 Excel 失败。'));
        const label = kind === 'editable' ? '可编辑数据' : '展示版';
        downloadBlob(
          await response.blob(),
          `${exportSettings.title.trim() || '项目工作台'}-${label}.xlsx`
        );
      },
      kind === 'editable' ? '已导出可编辑 Excel。' : '已导出展示版 Excel。'
    );
  }

  async function createOutlookDraft() {
    await runExport(async () => {
      await api(`/api/dashboards/${dashboardId}/export/outlook-draft?${reportQuery()}`, {
        method: 'POST',
        headers: { 'x-project-manager-action': 'create-outlook-draft' }
      });
    }, '已打开 Outlook 草稿，请检查后自行发送。');
  }

  async function downloadOutlookHtml() {
    await runExport(async () => {
      const response = await fetch(
        `/api/dashboards/${dashboardId}/export/outlook.html?${reportQuery()}`
      );
      if (!response.ok) throw new Error(await responseError(response, '导出邮件 HTML 失败。'));
      downloadBlob(
        await response.blob(),
        `${exportSettings.title.trim() || '项目工作台'}-Outlook报告.html`
      );
    }, '已导出 Outlook HTML。');
  }

  async function downloadBackup() {
    try {
      const response = await fetch('/api/workspace/backup');
      if (!response.ok) throw new Error(await responseError(response, '备份失败。'));
      downloadBlob(await response.blob(), 'ProjectManagerWorkspace.pmdbackup');
      setNotice('工作区备份已下载，请保存到安全的位置。');
      closePopover();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '下载工作区备份失败。');
    }
  }

  async function inspectWorkspaceRestore(file: File) {
    if (!file.name.toLowerCase().endsWith('.pmdbackup')) {
      setNotice('请选择 .pmdbackup 工作区备份文件。');
      return;
    }
    if (file.size === 0 || file.size > 128 * 1024 * 1024) {
      setNotice('备份文件必须大于 0 且不超过 128 MB。');
      return;
    }
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
          payload && 'message' in payload ? (payload.message ?? '检查备份失败。') : '检查备份失败。'
        );
      }
      setRestoreInspection(payload as RestoreInspection);
      setRestoreFileName(file.name);
      setRestoreReplacementConfirmed(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '检查工作区备份失败。');
    }
  }

  async function cancelWorkspaceRestore() {
    const restoreId = restoreInspection?.restoreId;
    if (!restoreId) return;
    try {
      const response = await fetch(`/api/workspace/restore/${restoreId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`取消失败（${response.status}）`);
      setRestoreInspection(undefined);
      setRestoreFileName('');
      setRestoreReplacementConfirmed(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '清理暂存的恢复文件失败。');
    }
  }

  async function confirmWorkspaceRestore() {
    if (!restoreInspection || !restoreReplacementConfirmed) return;
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
      closePopover();
      setNotice('恢复任务已安全暂存。请关闭并重新启动应用以完成恢复。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '准备工作区恢复失败。');
    }
  }

  async function openDiagnostics() {
    try {
      setDiagnostics(await api<RuntimeDiagnostics>('/api/diagnostics'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '读取本机诊断失败。');
    }
  }

  async function saveTableName(tableId: string) {
    const table = tables.find((candidate) => candidate.id === tableId);
    if (!table || !table.name.trim()) return;
    try {
      await api(`/api/databases/${tableId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: table.name.trim() })
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '重命名表格失败。');
      await refreshWorkspace();
    }
  }

  function movePageBlockByOffset(blockId: string, offset: -1 | 1) {
    const sourceIndex = pageBlocks.findIndex((block) => block.id === blockId);
    const targetIndex = sourceIndex + offset;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= pageBlocks.length) {
      closePopover();
      return;
    }
    setPageBlocks((current) => {
      const currentSourceIndex = current.findIndex((block) => block.id === blockId);
      const currentTargetIndex = currentSourceIndex + offset;
      if (currentSourceIndex < 0 || currentTargetIndex < 0 || currentTargetIndex >= current.length)
        return current;
      const next = [...current];
      const [source] = next.splice(currentSourceIndex, 1);
      next.splice(currentTargetIndex, 0, source!);
      if (dashboardId)
        void api(`/api/dashboards/${dashboardId}/block-order`, {
          method: 'PUT',
          body: JSON.stringify({ blockIds: next.map((item) => item.id) })
        });
      return next;
    });
    setNotice(offset < 0 ? '已将模块上移。' : '已将模块下移。');
    closePopover();
  }

  function reorderPageBlock(
    sourceBlockId: string,
    targetBlockId: string,
    edge: BlockDropTarget['edge']
  ) {
    if (sourceBlockId === targetBlockId) return;
    const sourceIndex = pageBlocks.findIndex((block) => block.id === sourceBlockId);
    const targetIndex = pageBlocks.findIndex((block) => block.id === targetBlockId);
    if (
      sourceIndex < 0 ||
      targetIndex < 0 ||
      (edge === 'before' && sourceIndex + 1 === targetIndex) ||
      (edge === 'after' && sourceIndex - 1 === targetIndex)
    )
      return;
    setPageBlocks((current) => {
      const currentSourceIndex = current.findIndex((block) => block.id === sourceBlockId);
      if (currentSourceIndex < 0) return current;
      const next = [...current];
      const [source] = next.splice(currentSourceIndex, 1);
      const currentTargetIndex = next.findIndex((block) => block.id === targetBlockId);
      if (!source || currentTargetIndex < 0) return current;
      next.splice(edge === 'before' ? currentTargetIndex : currentTargetIndex + 1, 0, source);
      if (next.every((block, index) => block.id === current[index]?.id)) return current;
      if (dashboardId)
        void api(`/api/dashboards/${dashboardId}/block-order`, {
          method: 'PUT',
          body: JSON.stringify({ blockIds: next.map((item) => item.id) })
        });
      return next;
    });
    setNotice('已调整模块顺序，导出预览会使用相同顺序。');
  }

  function startPageBlockReorder(event: ReactPointerEvent<HTMLButtonElement>, blockId: string) {
    event.preventDefault();
    event.stopPropagation();
    closePopover();
    setDraggingBlockId(blockId);
    document.body.classList.add('v2-is-dragging-module');

    const handleMove = (moveEvent: PointerEvent) => {
      const target = document
        .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest<HTMLElement>('[data-v2-block-id]');
      const targetBlockId = target?.dataset.v2BlockId;
      if (!target || !targetBlockId || targetBlockId === blockId) {
        setBlockDropTarget(undefined);
      } else {
        const rect = target.getBoundingClientRect();
        setBlockDropTarget({
          blockId: targetBlockId,
          edge: moveEvent.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
        });
      }
      if (moveEvent.clientY < 90) window.scrollBy({ top: -18 });
      if (moveEvent.clientY > window.innerHeight - 70) window.scrollBy({ top: 18 });
    };
    const cleanup = () => {
      setDraggingBlockId(undefined);
      setBlockDropTarget(undefined);
      document.body.classList.remove('v2-is-dragging-module');
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', cleanup);
      window.removeEventListener('blur', cleanup);
    };
    const handleUp = (upEvent: PointerEvent) => {
      const target = document
        .elementFromPoint(upEvent.clientX, upEvent.clientY)
        ?.closest<HTMLElement>('[data-v2-block-id]');
      const targetBlockId = target?.dataset.v2BlockId;
      if (target && targetBlockId && targetBlockId !== blockId) {
        const rect = target.getBoundingClientRect();
        reorderPageBlock(
          blockId,
          targetBlockId,
          upEvent.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
        );
      }
      cleanup();
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    window.addEventListener('pointercancel', cleanup, { once: true });
    window.addEventListener('blur', cleanup, { once: true });
  }

  function pageBlockClassName(baseClassName: string, blockId: string) {
    return [
      baseClassName,
      'v2-module-block',
      draggingBlockId === blockId ? 'is-dragging' : '',
      blockDropTarget?.blockId === blockId
        ? blockDropTarget.edge === 'before'
          ? 'is-drop-before'
          : 'is-drop-after'
        : ''
    ]
      .filter(Boolean)
      .join(' ');
  }

  async function loadImage(blockId: string, file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/gif'].includes(file.type)) {
      setNotice('请选择 PNG、JPEG 或 GIF 图片。');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNotice('图片不能超过 10 MB。');
      return;
    }
    try {
      const response = await fetch(`/api/dashboard-blocks/${blockId}/image`, {
        method: 'PUT',
        headers: {
          'content-type': file.type,
          'x-project-manager-filename': encodeURIComponent(file.name)
        },
        body: file
      });
      if (!response.ok)
        throw new Error((await response.json().catch(() => ({}))).message ?? '上传图片失败。');
      await refreshWorkspace();
      setNotice(`已保存图片“${file.name}”。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '上传图片失败。');
    }
  }

  async function deleteContentBlock(blockId: string) {
    setPageBlocks((current) => current.filter((block) => block.id !== blockId));
    setNotice('已删除页面模块。');
    closePopover();
    try {
      await api(`/api/dashboard-blocks/${blockId}/archive`, { method: 'POST' });
      await refreshWorkspace();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除模块失败。');
      await refreshWorkspace();
    }
  }

  async function addColumn(tableId: string) {
    const column: PrototypeColumn = {
      id: `column-${crypto.randomUUID()}`,
      name: '新属性',
      type: 'text',
      width: 200
    };
    updateTable(tableId, (table) => ({ ...table, columns: [...table.columns, column] }));
    try {
      const field = await api<{ id: string }>(`/api/databases/${tableId}/fields`, {
        method: 'POST',
        body: JSON.stringify({ name: column.name, type: 'long_text', config: { version: 1 } })
      });
      const next = { ...column, id: field.id };
      updateTable(tableId, (table) => ({
        ...table,
        columns: [...table.columns.filter((item) => item.id !== column.id), next]
      }));
      await saveTableView(tableId, {
        ...tables.find((table) => table.id === tableId)!,
        columns: [
          ...(tables.find((table) => table.id === tableId)?.columns ?? []).filter(
            (item) => item.id !== column.id
          ),
          next
        ]
      });
      await refreshWorkspace();
      // Notion-style: open the property editor for the new column so the
      // user can rename or change its type immediately.
      window.setTimeout(() => {
        const header = document.querySelector(
          `th[data-v2-column-id="${CSS.escape(field.id)}"] .v2-column-header`
        ) as HTMLElement | null;
        const refreshedTable = tablesRef.current.find((candidate) => candidate.id === tableId);
        const newColumn = refreshedTable?.columns.find((candidate) => candidate.id === field.id);
        if (refreshedTable && newColumn && header) {
          openColumnEditor(refreshedTable, newColumn, header);
        }
      }, 80);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '添加属性失败。');
      await refreshWorkspace();
    }
    setNotice('已添加新属性，可直接重命名或设置类型。');
  }

  function updateCell(tableId: string, rowId: string, columnId: string, value: string) {
    updateTable(tableId, (table) => ({
      ...table,
      rows: table.rows.map((row) =>
        row.id === rowId ? { ...row, values: { ...row.values, [columnId]: value } } : row
      )
    }));
    const table = tables.find((candidate) => candidate.id === tableId);
    const row = table?.rows.find((candidate) => candidate.id === rowId);
    if (table && row) {
      const values = { ...row.values, [columnId]: value };
      void api(`/api/records/${rowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ values: serializeValues(table, values) })
      }).catch((error) => setNotice(error instanceof Error ? error.message : '保存单元格失败。'));
    }
  }

  function updateBlankDraft(tableId: string, columnId: string, value: string) {
    setBlankRowDrafts((current) => ({
      ...current,
      [tableId]: { ...current[tableId], [columnId]: value }
    }));
  }

  async function commitBlankRow(tableId: string, override?: Record<string, string>) {
    const values = override ?? blankRowDrafts[tableId] ?? {};
    if (!Object.values(values).some((value) => value.trim())) return;
    updateTable(tableId, (table) => ({
      ...table,
      rows: [...table.rows, { id: `row-${crypto.randomUUID()}`, values }]
    }));
    setBlankRowDrafts((current) => ({ ...current, [tableId]: {} }));
    setNotice('正在创建新行…');
    const table = tables.find((candidate) => candidate.id === tableId);
    if (!table) return;
    try {
      await api(`/api/databases/${tableId}/records`, {
        method: 'POST',
        body: JSON.stringify({ values: serializeValues(table, values) })
      });
      await refreshWorkspace();
      setNotice('新行已自动创建。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '新建记录失败。');
      await refreshWorkspace();
    }
  }

  function startResize(
    event: ReactPointerEvent<HTMLSpanElement>,
    tableId: string,
    column: PrototypeColumn
  ) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = column.width;
    setResizingColumn({ tableId, columnId: column.id });
    document.body.classList.add('v2-is-resizing');
    const handleMove = (moveEvent: PointerEvent) => {
      const width = Math.max(76, Math.min(560, startWidth + moveEvent.clientX - startX));
      updateTable(tableId, (table) => ({
        ...table,
        columns: table.columns.map((candidate) =>
          candidate.id === column.id ? { ...candidate, width } : candidate
        )
      }));
    };
    const handleUp = () => {
      setResizingColumn(undefined);
      document.body.classList.remove('v2-is-resizing');
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      void saveTableView(tableId);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  }

  function moveColumn(tableId: string, sourceColumnId: string, targetColumnId: string) {
    updateTable(tableId, (table) => {
      const sourceIndex = table.columns.findIndex((column) => column.id === sourceColumnId);
      const targetIndex = table.columns.findIndex((column) => column.id === targetColumnId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return table;
      const columns = [...table.columns];
      const [source] = columns.splice(sourceIndex, 1);
      columns.splice(targetIndex, 0, source!);
      return { ...table, columns };
    });
    void Promise.resolve().then(() => saveTableView(tableId));
    setDraggingColumn(undefined);
  }

  function startColumnReorder(
    event: ReactPointerEvent<HTMLSpanElement>,
    tableId: string,
    columnId: string
  ) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingColumn({ tableId, columnId });
    document.body.classList.add('v2-is-dragging-column');
    const handleUp = (upEvent: PointerEvent) => {
      const target = document
        .elementFromPoint(upEvent.clientX, upEvent.clientY)
        ?.closest<HTMLElement>('th[data-v2-column-id]');
      if (target?.dataset.v2TableId === tableId && target.dataset.v2ColumnId) {
        moveColumn(tableId, columnId, target.dataset.v2ColumnId);
      } else {
        setDraggingColumn(undefined);
      }
      document.body.classList.remove('v2-is-dragging-column');
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointerup', handleUp, { once: true });
  }

  return (
    <div className="v2-shell">
      {loadError && <div className="v2-toast">{loadError}</div>}
      <aside className="v2-sidebar">
        <div className="v2-brand">
          <span>PM</span>
          <strong>项目工具</strong>
        </div>
        <a className="v2-sidebar-home" href="#page-top">
          ⌗ 项目工作台
        </a>
        <div className="v2-sidebar-label">页面模块</div>
        {pageBlocks.map((block) => {
          if (block.kind === 'table') {
            const table = tables.find((candidate) => candidate.id === block.tableId);
            return table ? (
              <a href={`#${table.id}`} key={block.id}>
                {table.icon} {table.name}
              </a>
            ) : null;
          }
          return (
            <a href={`#${block.id}`} key={block.id}>
              {block.kind === 'text'
                ? `¶ ${block.title.trim() || '文字'}`
                : `▧ ${block.title.trim() || '图片'}`}
            </a>
          );
        })}
        <div className="v2-sidebar-bottom">
          <button
            className="v2-sidebar-settings"
            onClick={(event) => setPopover({ kind: 'settings', anchor: event.currentTarget })}
            type="button"
          >
            ⚙ 设置与备份
          </button>
          <div className="v2-local-badge">
            本地工作区
            <br />
            <small>数据仅保存在本机，可随时备份</small>
          </div>
        </div>
      </aside>

      <main className="v2-page" id="page-top">
        <div className="v2-topline">
          <span>我的项目 / 项目工作台</span>
        </div>
        {restoreRestartRequired && (
          <div className="v2-restore-lock" role="alert">
            <strong>恢复已安全准备</strong>
            <span>请关闭并重新启动应用以完成恢复；当前工作区已切换为只读。</span>
          </div>
        )}
        <header className="v2-page-header">
          <div className="v2-page-icon">▦</div>
          <h1>项目工作台</h1>
          <p>在一个页面中直接维护不同结构的表格，然后统一生成周报。</p>
        </header>

        <div className="v2-page-actions">
          <button
            className="v2-button v2-button-quiet"
            disabled={restoreRestartRequired}
            onClick={(event) => {
              setNewTableName('');
              setModuleComposer(undefined);
              setPopover({ kind: 'add-module', anchor: event.currentTarget });
            }}
            type="button"
          >
            ＋ 添加模块
          </button>
          <button
            className="v2-button v2-button-quiet"
            disabled={restoreRestartRequired}
            onClick={(event) => setPopover({ kind: 'export', anchor: event.currentTarget })}
            type="button"
          >
            ↗ 导出
          </button>
          <span className="v2-page-summary">
            {pageBlocks.length} 个模块 · {tables.length} 张表 ·{' '}
            {tables.reduce((sum, table) => sum + table.rows.length, 0)} 条记录
          </span>
        </div>

        {notice && (
          <button className="v2-notice" onClick={() => setNotice('')} type="button">
            ✓ {notice}
          </button>
        )}

        <div className="v2-table-stack">
          {pageBlocks.map((block) => {
            if (block.kind === 'text') {
              return (
                <section
                  className={pageBlockClassName('v2-content-block', block.id)}
                  data-v2-block-id={block.id}
                  id={block.id}
                  key={block.id}
                >
                  <div className="v2-content-block-toolbar">
                    <span className="v2-content-block-label">
                      <button
                        aria-label="拖动文字模块调整顺序"
                        className="v2-block-drag-handle"
                        onPointerDown={(event) => startPageBlockReorder(event, block.id)}
                        title="拖动调整模块顺序"
                        type="button"
                      >
                        ⋮⋮
                      </button>
                      <span>¶ 文字</span>
                    </span>
                    <button
                      aria-label="文字模块更多操作"
                      onClick={(event) => {
                        setDestructiveConfirmation(undefined);
                        setPopover({
                          kind: 'content',
                          anchor: event.currentTarget,
                          blockId: block.id
                        });
                      }}
                      type="button"
                    >
                      •••
                    </button>
                  </div>
                  <input
                    aria-label="文字模块标题"
                    className="v2-page-module-title"
                    onChange={(event) =>
                      updatePageBlock(block.id, (current) =>
                        current.kind === 'text'
                          ? { ...current, title: event.target.value }
                          : current
                      )
                    }
                    placeholder="输入模块标题…"
                    onBlur={() => void saveContentBlock(block.id)}
                    value={block.title}
                  />
                  <textarea
                    aria-label="文字模块内容"
                    className="v2-page-text-editor"
                    onChange={(event) =>
                      updatePageBlock(block.id, (current) =>
                        current.kind === 'text'
                          ? { ...current, content: event.target.value }
                          : current
                      )
                    }
                    placeholder="输入说明、结论或本周摘要…"
                    onBlur={() => void saveContentBlock(block.id)}
                    rows={3}
                    value={block.content}
                  />
                </section>
              );
            }
            if (block.kind === 'image') {
              return (
                <section
                  className={pageBlockClassName('v2-content-block', block.id)}
                  data-v2-block-id={block.id}
                  id={block.id}
                  key={block.id}
                >
                  <div className="v2-content-block-toolbar">
                    <span className="v2-content-block-label">
                      <button
                        aria-label="拖动图片模块调整顺序"
                        className="v2-block-drag-handle"
                        onPointerDown={(event) => startPageBlockReorder(event, block.id)}
                        title="拖动调整模块顺序"
                        type="button"
                      >
                        ⋮⋮
                      </button>
                      <span>▧ 图片</span>
                    </span>
                    <button
                      aria-label="图片模块更多操作"
                      onClick={(event) => {
                        setDestructiveConfirmation(undefined);
                        setPopover({
                          kind: 'content',
                          anchor: event.currentTarget,
                          blockId: block.id
                        });
                      }}
                      type="button"
                    >
                      •••
                    </button>
                  </div>
                  <input
                    aria-label="图片模块标题"
                    className="v2-page-module-title"
                    onChange={(event) =>
                      updatePageBlock(block.id, (current) =>
                        current.kind === 'image'
                          ? { ...current, title: event.target.value }
                          : current
                      )
                    }
                    placeholder="添加图片标题（可选）…"
                    onBlur={() => void saveContentBlock(block.id)}
                    value={block.title}
                  />
                  {block.src ? (
                    <img
                      alt={block.title || block.caption || block.fileName || '页面图片'}
                      className="v2-page-image"
                      src={block.src}
                    />
                  ) : (
                    <label className="v2-image-upload">
                      <strong>选择本机图片</strong>
                      <span>PNG、JPEG 或 GIF，最大 10 MB</span>
                      <input
                        accept="image/png,image/jpeg,image/gif"
                        onChange={(event) => loadImage(block.id, event.target.files?.[0])}
                        type="file"
                      />
                    </label>
                  )}
                  {block.src && (
                    <label className="v2-image-replace">
                      更换图片
                      <input
                        accept="image/png,image/jpeg,image/gif"
                        onChange={(event) => loadImage(block.id, event.target.files?.[0])}
                        type="file"
                      />
                    </label>
                  )}
                  <input
                    aria-label="图片说明"
                    className="v2-image-caption"
                    onChange={(event) =>
                      updatePageBlock(block.id, (current) =>
                        current.kind === 'image'
                          ? { ...current, caption: event.target.value }
                          : current
                      )
                    }
                    placeholder="添加图片说明…"
                    onBlur={() => void saveContentBlock(block.id)}
                    value={block.caption}
                  />
                </section>
              );
            }
            const table = visibleTables.find((candidate) => candidate.id === block.tableId);
            if (!table) return null;
            return (
              <section
                className={pageBlockClassName('v2-table-block', block.id)}
                data-v2-block-id={block.id}
                id={table.id}
                key={block.id}
              >
                <div className="v2-table-title-row">
                  <div className="v2-table-title">
                    <button
                      aria-label={`拖动${table.name}模块调整顺序`}
                      className="v2-block-drag-handle"
                      onPointerDown={(event) => startPageBlockReorder(event, block.id)}
                      title="拖动调整模块顺序"
                      type="button"
                    >
                      ⋮⋮
                    </button>
                    <span>{table.icon}</span>
                    <input
                      aria-label={`${table.name}表格名称`}
                      value={table.name}
                      onChange={(event) =>
                        updateTable(table.id, (current) => ({
                          ...current,
                          name: event.target.value
                        }))
                      }
                      onBlur={() => void saveTableName(table.id)}
                    />
                  </div>
                  <div className="v2-table-tools">
                    <button
                      className={table.filter ? 'is-active' : ''}
                      onClick={(event) => openFilter(table, event.currentTarget)}
                      type="button"
                    >
                      ⇅ {table.filter ? '筛选 · 1' : '筛选'}
                    </button>
                    <button onClick={() => addColumn(table.id)} type="button">
                      ＋ 属性
                    </button>
                    <button
                      aria-label={`${table.name}更多操作`}
                      onClick={(event) => {
                        setDestructiveConfirmation(undefined);
                        setPopover({
                          kind: 'table',
                          anchor: event.currentTarget,
                          tableId: table.id
                        });
                      }}
                      type="button"
                    >
                      •••
                    </button>
                  </div>
                </div>

                <div className="v2-table-scroll">
                  <table className="v2-table">
                    <colgroup>
                      {table.columns.map((column) => (
                        <col key={column.id} style={{ width: column.width }} />
                      ))}
                      <col style={{ width: 42 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        {table.columns.map((column) => (
                          <th
                            className={[
                              draggingColumn?.tableId === table.id &&
                              draggingColumn.columnId === column.id
                                ? 'is-dragging'
                                : '',
                              resizingColumn?.tableId === table.id &&
                              resizingColumn.columnId === column.id
                                ? 'is-resizing'
                                : ''
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            data-v2-column-id={column.id}
                            data-v2-table-id={table.id}
                            key={column.id}
                          >
                            <button
                              className="v2-column-header"
                              onClick={(event) =>
                                openColumnEditor(table, column, event.currentTarget)
                              }
                              type="button"
                            >
                              <span
                                className="v2-drag-grip"
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) =>
                                  startColumnReorder(event, table.id, column.id)
                                }
                              >
                                ⋮⋮
                              </span>
                              <span className="v2-type-icon">{columnTypeIcon(column.type)}</span>
                              <span>{column.name}</span>
                              <span className="v2-header-caret">⌄</span>
                            </button>
                            <span
                              aria-label={`调整${column.name}列宽`}
                              className="v2-resize-handle"
                              onPointerDown={(event) => startResize(event, table.id, column)}
                              role="separator"
                            />
                          </th>
                        ))}
                        <th className="v2-add-column">
                          <button onClick={() => addColumn(table.id)} type="button">
                            ＋
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.visibleRows.map((row, rowIndex) => (
                        <tr key={row.id}>
                          {table.columns.map((column) => (
                            <td key={column.id}>
                              {renderCell(
                                column,
                                column.type === 'sequence'
                                  ? String(rowIndex + 1)
                                  : (row.values[column.id] ?? ''),
                                (value) => updateCell(table.id, row.id, column.id, value)
                              )}
                            </td>
                          ))}
                          <td className="v2-row-more">
                            <button
                              aria-label={`第 ${rowIndex + 1} 行操作`}
                              onClick={(event) => {
                                setDestructiveConfirmation(undefined);
                                setPopover({
                                  kind: 'row',
                                  anchor: event.currentTarget,
                                  tableId: table.id,
                                  rowId: row.id
                                });
                              }}
                              type="button"
                            >
                              ⋯
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className="v2-blank-row">
                        {table.columns.map((column) => {
                          const value =
                            column.type === 'sequence'
                              ? ''
                              : (blankRowDrafts[table.id]?.[column.id] ?? '');
                          return (
                            <td key={column.id}>
                              {column.type === 'sequence' ? (
                                <span className="v2-new-row-mark">＋</span>
                              ) : (
                                renderCell(
                                  column,
                                  value,
                                  (nextValue) => {
                                    const nextDraft = {
                                      ...blankRowDrafts[table.id],
                                      [column.id]: nextValue
                                    };
                                    updateBlankDraft(table.id, column.id, nextValue);
                                    if (column.type === 'status')
                                      commitBlankRow(table.id, nextDraft);
                                  },
                                  (currentValue) =>
                                    commitBlankRow(table.id, {
                                      ...blankRowDrafts[table.id],
                                      [column.id]: currentValue
                                    })
                                )
                              )}
                            </td>
                          );
                        })}
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                {table.filter && (
                  <div className="v2-filter-note">
                    当前筛选：
                    {
                      table.columns.find((column) => column.id === table.filter?.columnId)?.name
                    }{' '}
                    {table.filter.operator === 'contains' ? '包含' : '等于'}“{table.filter.keyword}”
                    · 显示 {table.visibleRows.length}/{table.rows.length}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>

      {popover && (
        <AnchoredPopover
          anchor={popover.anchor}
          popoverRef={popoverRef}
          width={popover.kind === 'column' ? 320 : 300}
        >
          {popover.kind === 'column' && propertyDraft && (
            <div className="v2-popover-content">
              <div className="v2-popover-title">
                <span>{columnTypeIcon(propertyDraft.type)}</span>
                <strong>属性设置</strong>
              </div>
              <label>
                属性名称
                <input
                  data-autofocus
                  value={propertyDraft.name}
                  onChange={(event) =>
                    setPropertyDraft({ ...propertyDraft, name: event.target.value })
                  }
                />
              </label>
              <label>
                属性类型
                <select
                  value={propertyDraft.type}
                  onChange={(event) => {
                    const type = event.target.value as PrototypeColumnType;
                    setPropertyDraft({
                      ...propertyDraft,
                      type,
                      options:
                        type === 'status'
                          ? (propertyDraft.options ?? ['未开始', '进行中', '已完成'])
                          : undefined
                    });
                  }}
                >
                  {typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.icon} {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {propertyDraft.type === 'status' && (
                <label>
                  状态选项
                  <input
                    value={propertyDraft.options?.join('，') ?? ''}
                    onChange={(event) =>
                      setPropertyDraft({
                        ...propertyDraft,
                        options: event.target.value
                          .split(/[，,]/)
                          .map((item) => item.trim())
                          .filter(Boolean)
                      })
                    }
                  />
                  <small>用逗号分隔；最后一个状态用于完成标记</small>
                </label>
              )}
              <label>
                导出水平对齐
                <select
                  value={propertyDraft.reportAlign ?? 'auto'}
                  onChange={(event) =>
                    setPropertyDraft({
                      ...propertyDraft,
                      reportAlign:
                        event.target.value === 'auto'
                          ? undefined
                          : (event.target.value as 'left' | 'center')
                    })
                  }
                >
                  <option value="auto">按属性类型自动</option>
                  <option value="left">左对齐</option>
                  <option value="center">居中</option>
                </select>
              </label>
              <label className="v2-check">
                <input
                  checked={propertyDraft.reportEmphasis === 'strong'}
                  onChange={(event) =>
                    setPropertyDraft({
                      ...propertyDraft,
                      reportEmphasis: event.target.checked ? 'strong' : undefined
                    })
                  }
                  type="checkbox"
                />
                在导出中作为行标题加粗
              </label>
              <div className="v2-destructive-zone">
                {destructiveConfirmation === 'column' ? (
                  <div className="v2-delete-confirm">
                    <span>删除后，该列中的值也会移除。</span>
                    <div>
                      <button onClick={() => setDestructiveConfirmation(undefined)} type="button">
                        取消
                      </button>
                      <button
                        className="is-danger"
                        onClick={() => deleteColumn(popover.tableId, popover.columnId)}
                        type="button"
                      >
                        确认删除
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="v2-menu-command is-danger"
                    onClick={() => setDestructiveConfirmation('column')}
                    type="button"
                  >
                    <span>⌫</span> 删除属性
                  </button>
                )}
              </div>
              <div className="v2-popover-actions">
                <button onClick={closePopover} type="button">
                  取消
                </button>
                <button className="is-primary" onClick={saveColumnProperty} type="button">
                  保存
                </button>
              </div>
            </div>
          )}

          {popover.kind === 'table' &&
            (() => {
              const table = tables.find((candidate) => candidate.id === popover.tableId);
              if (!table) return null;
              const block = pageBlocks.find(
                (candidate) => candidate.kind === 'table' && candidate.tableId === table.id
              );
              const blockIndex = block
                ? pageBlocks.findIndex((candidate) => candidate.id === block.id)
                : -1;
              return (
                <div className="v2-popover-content v2-compact-menu">
                  <div className="v2-popover-title">
                    <span>▤</span>
                    <strong>{table.name}</strong>
                  </div>
                  {destructiveConfirmation === 'table' ? (
                    <div className="v2-delete-confirm">
                      <span>删除整张表格及其当前记录？</span>
                      <div>
                        <button onClick={() => setDestructiveConfirmation(undefined)} type="button">
                          取消
                        </button>
                        <button
                          className="is-danger"
                          onClick={() => deleteTable(table.id)}
                          type="button"
                        >
                          确认删除
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="v2-menu-list">
                      <button
                        className="v2-menu-command"
                        disabled={blockIndex <= 0}
                        onClick={() => block && movePageBlockByOffset(block.id, -1)}
                        type="button"
                      >
                        <span>↑</span> 上移模块
                      </button>
                      <button
                        className="v2-menu-command"
                        disabled={blockIndex < 0 || blockIndex >= pageBlocks.length - 1}
                        onClick={() => block && movePageBlockByOffset(block.id, 1)}
                        type="button"
                      >
                        <span>↓</span> 下移模块
                      </button>
                      <button
                        className="v2-menu-command"
                        onClick={() => duplicateTable(table.id)}
                        type="button"
                      >
                        <span>⧉</span> 复制表格
                      </button>
                      <button
                        className="v2-menu-command is-danger"
                        onClick={() => setDestructiveConfirmation('table')}
                        type="button"
                      >
                        <span>⌫</span> 删除表格
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

          {popover.kind === 'row' &&
            (() => {
              const table = tables.find((candidate) => candidate.id === popover.tableId);
              if (!table) return null;
              return (
                <div className="v2-popover-content v2-compact-menu">
                  <div className="v2-popover-title">
                    <span>≡</span>
                    <strong>记录操作</strong>
                  </div>
                  {destructiveConfirmation === 'row' ? (
                    <div className="v2-delete-confirm">
                      <span>确认删除这条记录？</span>
                      <div>
                        <button onClick={() => setDestructiveConfirmation(undefined)} type="button">
                          取消
                        </button>
                        <button
                          className="is-danger"
                          onClick={() => deleteRow(table.id, popover.rowId)}
                          type="button"
                        >
                          确认删除
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="v2-menu-list">
                      <button
                        className="v2-menu-command"
                        onClick={() => duplicateRow(table.id, popover.rowId)}
                        type="button"
                      >
                        <span>⧉</span> 复制记录
                      </button>
                      <button
                        className="v2-menu-command is-danger"
                        onClick={() => setDestructiveConfirmation('row')}
                        type="button"
                      >
                        <span>⌫</span> 删除记录
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

          {popover.kind === 'content' &&
            (() => {
              const block = pageBlocks.find((candidate) => candidate.id === popover.blockId);
              if (!block || block.kind === 'table') return null;
              const blockIndex = pageBlocks.findIndex((candidate) => candidate.id === block.id);
              return (
                <div className="v2-popover-content v2-compact-menu">
                  <div className="v2-popover-title">
                    <span>{block.kind === 'text' ? '¶' : '▧'}</span>
                    <strong>
                      {block.kind === 'text'
                        ? block.title.trim() || '文字模块'
                        : block.title.trim() || '图片模块'}
                    </strong>
                  </div>
                  {destructiveConfirmation === 'content' ? (
                    <div className="v2-delete-confirm">
                      <span>确认从页面中删除这个模块？</span>
                      <div>
                        <button onClick={() => setDestructiveConfirmation(undefined)} type="button">
                          取消
                        </button>
                        <button
                          className="is-danger"
                          onClick={() => deleteContentBlock(block.id)}
                          type="button"
                        >
                          确认删除
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="v2-menu-list">
                      <button
                        className="v2-menu-command"
                        disabled={blockIndex <= 0}
                        onClick={() => movePageBlockByOffset(block.id, -1)}
                        type="button"
                      >
                        <span>↑</span> 上移模块
                      </button>
                      <button
                        className="v2-menu-command"
                        disabled={blockIndex >= pageBlocks.length - 1}
                        onClick={() => movePageBlockByOffset(block.id, 1)}
                        type="button"
                      >
                        <span>↓</span> 下移模块
                      </button>
                      <button
                        className="v2-menu-command is-danger"
                        onClick={() => setDestructiveConfirmation('content')}
                        type="button"
                      >
                        <span>⌫</span> 删除模块
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

          {popover.kind === 'filter' &&
            (() => {
              const table = tables.find((candidate) => candidate.id === popover.tableId)!;
              return (
                <div className="v2-popover-content">
                  <div className="v2-popover-title">
                    <span>⇅</span>
                    <strong>筛选 {table.name}</strong>
                  </div>
                  <label>
                    属性
                    <select
                      value={filterDraft.columnId}
                      onChange={(event) => {
                        const column = table.columns.find(
                          (candidate) => candidate.id === event.target.value
                        );
                        setFilterDraft({
                          ...filterDraft,
                          columnId: event.target.value,
                          operator: filterOperatorForColumn(column),
                          keyword: ''
                        });
                      }}
                    >
                      {table.columns
                        .filter((column) => column.type !== 'sequence')
                        .map((column) => (
                          <option key={column.id} value={column.id}>
                            {column.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  {renderFilterValueEditor(
                    table.columns.find((column) => column.id === filterDraft.columnId),
                    filterDraft,
                    setFilterDraft
                  )}
                  <div className="v2-popover-actions">
                    <button onClick={() => void clearFilter(table.id)} type="button">
                      清除
                    </button>
                    <button
                      className="is-primary"
                      onClick={() => applyFilter(table.id)}
                      type="button"
                    >
                      应用筛选
                    </button>
                  </div>
                </div>
              );
            })()}

          {popover.kind === 'export' && (
            <div className="v2-popover-content">
              <div className="v2-popover-title">
                <span>↗</span>
                <strong>导出当前页面</strong>
              </div>
              <label>
                报告标题
                <input
                  value={exportSettings.title}
                  onChange={(event) =>
                    setExportSettings({ ...exportSettings, title: event.target.value })
                  }
                />
              </label>
              <label>
                报告周期
                <input
                  placeholder={currentWeekPlaceholder()}
                  value={exportSettings.period}
                  onChange={(event) =>
                    setExportSettings({ ...exportSettings, period: event.target.value })
                  }
                />
              </label>
              <label className="v2-check">
                <input
                  checked={exportSettings.includeCompleted}
                  onChange={(event) =>
                    setExportSettings({ ...exportSettings, includeCompleted: event.target.checked })
                  }
                  type="checkbox"
                />
                包含已完成事项
              </label>
              <label className="v2-check">
                <input
                  checked={exportSettings.includeEmpty}
                  onChange={(event) =>
                    setExportSettings({ ...exportSettings, includeEmpty: event.target.checked })
                  }
                  type="checkbox"
                />
                包含空表
              </label>
              <button
                className="v2-preview-button"
                onClick={() => {
                  setPreviewMode('report');
                  closePopover();
                }}
                type="button"
              >
                预览完整导出效果
              </button>
              <div className="v2-export-actions">
                <button
                  disabled={isExporting}
                  onClick={() => void downloadWorkbook('editable')}
                  type="button"
                >
                  可编辑 Excel
                </button>
                <button
                  disabled={isExporting}
                  onClick={() => void downloadWorkbook('presentation')}
                  type="button"
                >
                  展示版 Excel
                </button>
              </div>
              <div className="v2-export-divider">Outlook（可选）</div>
              <button
                className="v2-export-fallback"
                disabled={isExporting}
                onClick={() => void createOutlookDraft()}
                type="button"
              >
                Outlook 草稿
              </button>
              <button
                className="v2-export-fallback"
                disabled={isExporting}
                onClick={() => void downloadOutlookHtml()}
                type="button"
              >
                下载 Outlook HTML 备用文件
              </button>
            </div>
          )}

          {popover.kind === 'settings' && (
            <div className="v2-popover-content v2-settings-popover">
              <div className="v2-popover-title">
                <span>⚙</span>
                <strong>设置与备份</strong>
              </div>
              <div className="v2-settings-group">
                <button onClick={() => void downloadBackup()} type="button">
                  ⇩ 下载工作区备份
                </button>
                <span className="v2-settings-hint">
                  完整备份所有表格、文字、图片，保存为 .pmdbackup
                </span>
                <button
                  onClick={() => {
                    setRestoreInspection(undefined);
                    setRestoreReplacementConfirmed(false);
                    restoreFileInputRef.current?.click();
                  }}
                  type="button"
                >
                  ⇧ 从备份恢复
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
                <span className="v2-settings-hint">恢复会替换整个工作区，重启后生效</span>
                <button onClick={() => void openDiagnostics()} type="button">
                  ⓘ 本机诊断
                </button>
              </div>
              {restoreInspection && (
                <div className="v2-restore-inspect">
                  <strong>确认替换当前工作区</strong>
                  <p>{restoreFileName}</p>
                  <dl>
                    <div>
                      <dt>备份工作区</dt>
                      <dd>{restoreInspection.manifest.workspace?.name ?? '空工作区'}</dd>
                    </div>
                    <div>
                      <dt>创建时间</dt>
                      <dd>
                        {new Date(restoreInspection.manifest.createdAt).toLocaleString('zh-CN')}
                      </dd>
                    </div>
                    <div>
                      <dt>数据库大小</dt>
                      <dd>
                        {(restoreInspection.manifest.database.bytes / 1024 / 1024).toFixed(2)} MB
                      </dd>
                    </div>
                  </dl>
                  <p className="v2-restore-warning">
                    恢复将在重启时完整替换当前工作区，确认前会自动创建一份当前备份；启动失败会自动回滚。
                  </p>
                  <label className="v2-check">
                    <input
                      checked={restoreReplacementConfirmed}
                      onChange={(event) => setRestoreReplacementConfirmed(event.target.checked)}
                      type="checkbox"
                    />
                    我理解当前工作区将被完整替换
                  </label>
                  <div className="v2-popover-actions">
                    <button onClick={() => void cancelWorkspaceRestore()} type="button">
                      取消
                    </button>
                    <button
                      className="is-primary"
                      disabled={!restoreReplacementConfirmed}
                      onClick={() => void confirmWorkspaceRestore()}
                      type="button"
                    >
                      确认并准备重启
                    </button>
                  </div>
                </div>
              )}
              {diagnostics && (
                <div className="v2-diagnostics">
                  <strong>本机诊断</strong>
                  <dl>
                    <div>
                      <dt>应用版本</dt>
                      <dd>{diagnostics.application.version}</dd>
                    </div>
                    <div>
                      <dt>本地地址</dt>
                      <dd>http://{diagnostics.application.loopbackAddress}</dd>
                    </div>
                    <div>
                      <dt>运行环境</dt>
                      <dd>
                        {diagnostics.application.platform} · {diagnostics.application.architecture}{' '}
                        · Node {diagnostics.application.nodeVersion}
                      </dd>
                    </div>
                    <div>
                      <dt>数据库</dt>
                      <dd>{diagnostics.storage.database.healthy ? '健康' : '需要检查'}</dd>
                    </div>
                    <div>
                      <dt>迁移状态</dt>
                      <dd>
                        {diagnostics.storage.migration.appliedCount}/
                        {diagnostics.storage.migration.totalCount} 已应用
                      </dd>
                    </div>
                    <div>
                      <dt>数据目录</dt>
                      <dd>{diagnostics.storage.dataDirectory}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          )}

          {popover.kind === 'add-module' && (
            <div className="v2-popover-content">
              <div className="v2-popover-title">
                <span>{moduleComposer === 'table' ? '▤' : '＋'}</span>
                <strong>{moduleComposer === 'table' ? '新建内嵌表格' : '添加页面模块'}</strong>
              </div>
              {moduleComposer === 'table' ? (
                <>
                  <label>
                    表格名称
                    <input
                      autoFocus
                      placeholder="例如：里程碑计划、关键事项跟踪"
                      value={newTableName}
                      onChange={(event) => setNewTableName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') addTable();
                      }}
                    />
                  </label>
                  <div className="v2-template-list">
                    <button onClick={() => setNewTableName('')} type="button">
                      <strong>空白表格</strong>
                      <small>默认列：名称、状态、自动编号</small>
                    </button>
                    <button onClick={() => setNewTableName('里程碑计划')} type="button">
                      <strong>里程碑计划</strong>
                      <small>预填名称，列仍可自由修改</small>
                    </button>
                  </div>
                  <div className="v2-popover-actions">
                    <button onClick={() => setModuleComposer(undefined)} type="button">
                      返回
                    </button>
                    <button
                      className="is-primary"
                      disabled={!newTableName.trim()}
                      onClick={addTable}
                      type="button"
                    >
                      创建表格
                    </button>
                  </div>
                </>
              ) : (
                <div className="v2-template-list v2-module-types">
                  <button onClick={() => setModuleComposer('table')} type="button">
                    <strong>▤ 表格</strong>
                    <small>自定义属性、记录和筛选</small>
                  </button>
                  <button onClick={addTextBlock} type="button">
                    <strong>¶ 文字</strong>
                    <small>说明、结论或周报摘要</small>
                  </button>
                  <button onClick={addImageBlock} type="button">
                    <strong>▧ 图片</strong>
                    <small>从本机选择并添加说明</small>
                  </button>
                </div>
              )}
            </div>
          )}
        </AnchoredPopover>
      )}

      {previewMode && (
        <ExportPreview
          exportSettings={exportSettings}
          mode={previewMode}
          onClose={() => setPreviewMode(undefined)}
          onModeChange={setPreviewMode}
          pageBlocks={pageBlocks}
          tables={tables}
        />
      )}
    </div>
  );
}

function AnchoredPopover({
  anchor,
  popoverRef,
  width,
  children
}: {
  anchor: HTMLElement;
  popoverRef: RefObject<HTMLDivElement | null>;
  width: number;
  children: ReactNode;
}) {
  const [position, setPosition] = useState({ top: 0, left: 0, ready: false });

  useLayoutEffect(() => {
    const updatePosition = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const height = popoverRef.current?.getBoundingClientRect().height ?? 280;
      const maximumLeft = Math.max(12, window.innerWidth - width - 12);
      const left = Math.min(maximumLeft, Math.max(12, anchorRect.left));
      const below = anchorRect.bottom + 7;
      const top =
        below + height <= window.innerHeight - 12
          ? below
          : Math.max(12, anchorRect.top - height - 7);
      setPosition({ top, left, ready: true });
    };
    updatePosition();
    const frame = requestAnimationFrame(() => {
      updatePosition();
      // Focus the intended control once the popover is positioned and
      // visible; React 19 drops autoFocus when the portal mounts with the
      // control in the same commit while the container is still hidden.
      const target = popoverRef.current?.querySelector<HTMLElement>('[data-autofocus]');
      target?.focus();
    });
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchor, popoverRef, width]);

  return createPortal(
    <div
      className="v2-anchored-popover"
      ref={popoverRef}
      style={{
        top: position.top,
        left: position.left,
        width,
        visibility: position.ready ? 'visible' : 'hidden'
      }}
    >
      {children}
    </div>,
    document.body
  );
}

function ExportPreview({
  pageBlocks,
  tables,
  exportSettings,
  mode,
  onModeChange,
  onClose
}: {
  pageBlocks: PrototypePageBlock[];
  tables: PrototypeTable[];
  exportSettings: ExportSettings;
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const includedTables = tables
    .map((table) => {
      const statusColumn = table.columns.find((column) => column.type === 'status');
      const completedValue = statusColumn?.options?.at(-1);
      const rows = filterRows(table).filter(
        (row) =>
          exportSettings.includeCompleted ||
          !completedValue ||
          row.values[statusColumn!.id] !== completedValue
      );
      return { table, rows };
    })
    .filter(({ rows }) => exportSettings.includeEmpty || rows.length > 0);
  const includedTableMap = new Map(
    includedTables.map(({ table, rows }) => [table.id, { table, rows }])
  );
  return createPortal(
    <div
      className="v2-preview-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="v2-preview-dialog">
        <div className="v2-preview-toolbar">
          <div>
            <strong>导出预览</strong>
            <span>静态内容，不包含筛选和编辑按钮</span>
          </div>
          <div className="v2-preview-tabs">
            <button
              className={mode === 'report' ? 'is-active' : ''}
              onClick={() => onModeChange('report')}
              type="button"
            >
              报告预览
            </button>
            <button
              className={mode === 'excel' ? 'is-active' : ''}
              onClick={() => onModeChange('excel')}
              type="button"
            >
              Excel 排版预览
            </button>
          </div>
          <button
            aria-label="关闭预览"
            className="v2-preview-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="v2-preview-canvas">
          <div className={`v2-report-page ${mode === 'excel' ? 'is-excel-preview' : ''}`}>
            <h1>{exportSettings.title || '项目工作台'}</h1>
            {exportSettings.period && <p>{exportSettings.period}</p>}
            {pageBlocks.map((block) => {
              if (block.kind === 'text') {
                if (!exportSettings.includeEmpty && !block.title.trim() && !block.content.trim())
                  return null;
                return (
                  <section className="v2-static-text-block" key={block.id}>
                    <h2>{block.title.trim() || '文字'}</h2>
                    <p>{block.content.trim() || '—'}</p>
                  </section>
                );
              }
              if (block.kind === 'image') {
                if (!block.src && !exportSettings.includeEmpty) return null;
                return (
                  <section className="v2-static-image-block" key={block.id}>
                    {block.title.trim() && <h2>{block.title.trim()}</h2>}
                    {block.src ? (
                      <img
                        alt={block.title || block.caption || block.fileName || '页面图片'}
                        src={block.src}
                      />
                    ) : (
                      <div>未选择图片</div>
                    )}
                    {block.caption && <p>{block.caption}</p>}
                  </section>
                );
              }
              const included = includedTableMap.get(block.tableId);
              if (!included) return null;
              const { table, rows } = included;
              return (
                <section className={mode === 'excel' ? 'is-excel' : ''} key={block.id}>
                  <h2>{table.name}</h2>
                  {mode === 'excel' && (
                    <div className="v2-excel-grid-label">
                      <span>60 列基础网格自动分配</span>
                      <span>文本列更宽 · 状态列更窄</span>
                    </div>
                  )}
                  <div
                    className="v2-static-grid"
                    style={
                      {
                        '--preview-columns': table.columns
                          .map((column) => `${excelWeight(column)}fr`)
                          .join(' ')
                      } as CSSProperties
                    }
                  >
                    {table.columns.map((column) => (
                      <strong key={column.id}>{column.name}</strong>
                    ))}
                    {rows.length === 0 &&
                      table.columns.map((column) => (
                        <span className="is-empty is-centered" key={column.id}>
                          —
                        </span>
                      ))}
                    {rows.map((row, rowIndex) =>
                      table.columns.map((column) => {
                        const value =
                          column.type === 'sequence'
                            ? String(rowIndex + 1)
                            : row.values[column.id] || '—';
                        return (
                          <span
                            className={reportCellClass(column, value, rowIndex)}
                            key={`${row.id}-${column.id}`}
                          >
                            {value}
                          </span>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
        <div className="v2-preview-footer">
          <span>
            {mode === 'excel'
              ? '展示版：一个工作表，按 60 列网格自动合并。可编辑版仍为每张表一个工作表。'
              : '报告：静态内容，与导出的文件一致，不含编辑控件。'}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}

function resizeTextArea(element: HTMLTextAreaElement) {
  element.style.height = '0px';
  element.style.height = `${Math.max(38, element.scrollHeight)}px`;
}

function AutoTextCell({
  label,
  value,
  width,
  onChange,
  onBlur
}: {
  label: string;
  value: string;
  width: number;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
}) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (textAreaRef.current) resizeTextArea(textAreaRef.current);
  }, [value, width]);

  return (
    <textarea
      aria-label={label}
      onBlur={(event) => onBlur?.(event.currentTarget.value)}
      onChange={(event) => {
        resizeTextArea(event.currentTarget);
        onChange(event.target.value);
      }}
      placeholder="输入…"
      ref={textAreaRef}
      rows={1}
      value={value}
    />
  );
}

function renderCell(
  column: PrototypeColumn,
  value: string,
  onChange: (value: string) => void,
  onBlur?: (value: string) => void
) {
  if (column.type === 'sequence') return <span className="v2-sequence">{value}</span>;
  if (column.type === 'status') {
    return (
      <select
        aria-label={column.name}
        className={`v2-status v2-status-${statusTone(value)}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">选择状态</option>
        {(column.options ?? ['未开始', '进行中', '已完成']).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (column.type === 'text') {
    return (
      <AutoTextCell
        label={column.name}
        onBlur={onBlur}
        onChange={onChange}
        value={value}
        width={column.width}
      />
    );
  }
  return (
    <input
      aria-label={column.name}
      type={column.type === 'date' ? 'date' : column.type === 'number' ? 'number' : 'text'}
      value={value}
      onBlur={(event) => onBlur?.(event.currentTarget.value)}
      onChange={(event) => onChange(event.target.value)}
      placeholder="输入…"
    />
  );
}

function renderFilterValueEditor(
  column: PrototypeColumn | undefined,
  filter: PrototypeFilter,
  onChange: (filter: PrototypeFilter) => void
) {
  if (column?.type === 'status') {
    return (
      <label>
        等于
        <select
          data-autofocus
          value={filter.keyword}
          onChange={(event) => onChange({ ...filter, keyword: event.target.value })}
        >
          <option value="">选择状态</option>
          {(column.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label>
      {filter.operator === 'contains' ? '包含文字' : '等于'}
      <input
        data-autofocus
        placeholder={filter.operator === 'contains' ? '输入筛选内容' : '输入精确值'}
        type={column?.type === 'date' ? 'date' : column?.type === 'number' ? 'number' : 'text'}
        value={filter.keyword}
        onChange={(event) => onChange({ ...filter, keyword: event.target.value })}
      />
    </label>
  );
}

function filterOperatorForColumn(column: PrototypeColumn | undefined): PrototypeFilter['operator'] {
  return column?.type === 'text' || column?.type === 'person' ? 'contains' : 'equals';
}

function serializeFilter(table: PrototypeTable): ViewConfig['filter'] {
  if (!table.filter) return null;
  const column = table.columns.find((candidate) => candidate.id === table.filter!.columnId);
  if (!column) return null;
  const option = column.optionValues?.find(
    (candidate) => candidate.label === table.filter!.keyword
  );
  const value =
    column.type === 'number'
      ? Number(table.filter.keyword)
      : column.type === 'status'
        ? (option?.id ?? table.filter.keyword)
        : table.filter.keyword;
  return {
    kind: 'condition',
    fieldId: column.id,
    operator: filterOperatorForColumn(column),
    value
  };
}

function deserializeFilter(
  filter: ViewConfig['filter'],
  fields: ServerField[]
): PrototypeFilter | undefined {
  if (!filter || filter.kind !== 'condition') return undefined;
  if (filter.operator !== 'contains' && filter.operator !== 'equals') return undefined;
  const field = fields.find((candidate) => candidate.id === filter.fieldId);
  if (!field) return undefined;
  const option = field.config.options?.find((candidate) => candidate.id === filter.value);
  return {
    columnId: filter.fieldId,
    operator: filter.operator,
    keyword: option?.label ?? String(filter.value ?? '')
  };
}

function filterRows(table: PrototypeTable) {
  if (!table.filter?.keyword) return table.rows;
  const keyword = table.filter.keyword.toLocaleLowerCase();
  return table.rows.filter((row) => {
    const value = (row.values[table.filter!.columnId] ?? '').toLocaleLowerCase();
    return table.filter!.operator === 'equals' ? value === keyword : value.includes(keyword);
  });
}

function columnTypeIcon(type: PrototypeColumnType) {
  return typeOptions.find((option) => option.value === type)?.icon ?? 'Aa';
}

function statusTone(value: string) {
  if (/完成|closed/i.test(value)) return 'done';
  if (/进行|open/i.test(value)) return 'active';
  if (/暂停|suspend/i.test(value)) return 'paused';
  return 'neutral';
}

function reportCellClass(column: PrototypeColumn, value: string, rowIndex: number) {
  const automaticCenterTypes: PrototypeColumnType[] = ['sequence', 'date', 'person', 'status'];
  const centered =
    column.reportAlign === 'center' ||
    (column.reportAlign !== 'left' && automaticCenterTypes.includes(column.type));
  return [
    rowIndex % 2 === 1 ? 'is-alt-row' : '',
    column.type === 'status' ? `is-status is-status-${statusTone(value)}` : '',
    centered ? 'is-centered' : '',
    column.reportEmphasis === 'strong' ? 'is-title' : ''
  ]
    .filter(Boolean)
    .join(' ');
}

function excelWeight(column: PrototypeColumn) {
  if (column.type === 'sequence') return 0.7;
  if (column.type === 'status' || column.type === 'date' || column.type === 'person') return 1.1;
  return Math.max(1.2, column.width / 130);
}

function toPrototypeColumnType(type: FieldType): PrototypeColumnType {
  if (type === 'sequence') return 'sequence';
  if (type === 'status' || type === 'single_select') return 'status';
  if (type === 'person') return 'person';
  if (type === 'date') return 'date';
  if (type === 'number') return 'number';
  return 'text';
}

function toServerFieldType(type: PrototypeColumnType): FieldType {
  if (type === 'sequence') return 'sequence';
  if (type === 'status') return 'status';
  if (type === 'person') return 'person';
  if (type === 'date') return 'date';
  if (type === 'number') return 'number';
  return 'long_text';
}

function defaultWidth(type: FieldType) {
  if (type === 'sequence') return 76;
  if (type === 'status') return 132;
  if (type === 'date' || type === 'person') return 150;
  return 220;
}

function serializeValues(table: PrototypeTable, values: Record<string, string>) {
  const entries: Array<[string, string | number]> = [];
  for (const [fieldId, value] of Object.entries(values)) {
    const column = table.columns.find((candidate) => candidate.id === fieldId);
    if (!column || column.type === 'sequence') continue;
    const option = column.optionValues?.find((candidate) => candidate.label === value);
    entries.push([
      fieldId,
      column.type === 'number' && value !== '' ? Number(value) : (option?.id ?? value)
    ]);
  }
  return Object.fromEntries(entries);
}

async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers }
  });
  if (response.ok) return (await response.json()) as T;
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  throw new Error(body?.message ?? `请求失败（${response.status}）`);
}

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  return body?.message ?? fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
