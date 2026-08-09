import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  FieldType,
  FilterCondition,
  FilterOperator,
  ViewConfig
} from '@project-manager/domain';
import { App as AdvancedApp } from './App';

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

type ViewSummary = { id: string; databaseId: string; name: string; config: ViewConfig };
type DashboardBlock = {
  id: string;
  isCollapsed: boolean;
  includeInExport: boolean;
  view: {
    view: ViewSummary;
    database: DatabaseSummary;
    fields: Field[];
    records: RecordRow[];
  };
};
type DashboardDetail = {
  dashboard: { id: string; name: string; description: string | null };
  blocks: DashboardBlock[];
};
type EditableValue = string | boolean | string[];
type FilterDraft = { fieldId: string; operator: FilterOperator; value: string };

const fieldTypes: Array<{ value: FieldType; label: string }> = [
  { value: 'short_text', label: '文本' },
  { value: 'long_text', label: '长文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'single_select', label: '单选' },
  { value: 'multi_select', label: '多选' },
  { value: 'status', label: '状态' },
  { value: 'person', label: '人员' },
  { value: 'checkbox', label: '勾选' },
  { value: 'url', label: '链接' },
  { value: 'sequence', label: '自动编号' }
];

const filterLabels: Partial<Record<FilterOperator, string>> = {
  equals: '等于',
  not_equals: '不等于',
  contains: '包含',
  not_contains: '不包含',
  contains_any: '包含任一项',
  contains_none: '不包含任一项',
  greater_than: '大于',
  less_than: '小于',
  before: '早于',
  after: '晚于',
  is_empty: '为空',
  is_not_empty: '不为空',
  is_checked: '已勾选',
  is_not_checked: '未勾选'
};

export function WorkspaceApp() {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardDetail>();
  const [health, setHealth] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [isAddingTable, setIsAddingTable] = useState(false);
  const [tableName, setTableName] = useState('');
  const [tableDescription, setTableDescription] = useState('');
  const [databaseNameDrafts, setDatabaseNameDrafts] = useState<Record<string, string>>({});
  const [fieldNameDrafts, setFieldNameDrafts] = useState<Record<string, string>>({});
  const [recordDrafts, setRecordDrafts] = useState<Record<string, Record<string, EditableValue>>>(
    {}
  );
  const [newRecordDrafts, setNewRecordDrafts] = useState<
    Record<string, Record<string, EditableValue>>
  >({});
  const [addingFieldDatabaseId, setAddingFieldDatabaseId] = useState<string>();
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('short_text');
  const [newFieldOptions, setNewFieldOptions] = useState('未开始, 进行中, 已完成');
  const [filterDrafts, setFilterDrafts] = useState<Record<string, FilterDraft>>({});
  const [reportTitle, setReportTitle] = useState('');
  const [reportPeriod, setReportPeriod] = useState('');
  const [includeCompleted, setIncludeCompleted] = useState(true);

  useEffect(() => {
    void initialize();
    // The initial workspace bootstrap is intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blockCount = dashboard?.blocks.length ?? 0;
  const recordCount = useMemo(
    () => dashboard?.blocks.reduce((total, block) => total + block.view.records.length, 0) ?? 0,
    [dashboard]
  );

  async function initialize() {
    setHealth('loading');
    try {
      await request('/api/health');
      const next = await request<DashboardDetail>('/api/workspace/primary-dashboard', {
        method: 'POST'
      });
      hydrate(next);
      setHealth('ready');
    } catch (requestError) {
      setHealth('error');
      setError(readError(requestError, '无法打开本地工作台。'));
    }
  }

  function hydrate(next: DashboardDetail) {
    setDashboard(next);
    setDatabaseNameDrafts(
      Object.fromEntries(
        next.blocks.map((block) => [block.view.database.id, block.view.database.name])
      )
    );
    setFieldNameDrafts(
      Object.fromEntries(
        next.blocks.flatMap((block) => block.view.fields.map((field) => [field.id, field.name]))
      )
    );
    setRecordDrafts(
      Object.fromEntries(
        next.blocks.flatMap((block) =>
          block.view.records.map((record) => [
            record.id,
            Object.fromEntries(
              block.view.fields.map((field) => [field.id, toEditableValue(field, record)])
            )
          ])
        )
      )
    );
    setFilterDrafts((current) =>
      Object.fromEntries(
        next.blocks.map((block) => {
          const filter = block.view.view.config.filter;
          const condition = filter?.kind === 'condition' ? filter : undefined;
          const firstField = block.view.fields[0];
          return [
            block.view.view.id,
            current[block.view.view.id] ?? {
              fieldId: condition?.fieldId ?? firstField?.id ?? '',
              operator: condition?.operator ?? defaultFilterOperator(firstField?.type),
              value: Array.isArray(condition?.value)
                ? String(condition?.value[0] ?? '')
                : String(condition?.value ?? '')
            }
          ];
        })
      )
    );
  }

  async function refresh() {
    const next = await request<DashboardDetail>('/api/workspace/primary-dashboard', {
      method: 'POST'
    });
    hydrate(next);
  }

  async function createTable(event: FormEvent) {
    event.preventDefault();
    if (!tableName.trim()) return;
    await runSaving(async () => {
      await request('/api/databases', {
        method: 'POST',
        body: JSON.stringify({
          name: tableName.trim(),
          description: tableDescription.trim() || null
        })
      });
      await refresh();
      setTableName('');
      setTableDescription('');
      setIsAddingTable(false);
      setNotice('新表格已经加入当前页面。点击“添加列”即可开始。');
    }, '创建表格失败。');
  }

  async function renameDatabase(database: DatabaseSummary) {
    const name = databaseNameDrafts[database.id]?.trim();
    if (!name || name === database.name) return;
    await runSaving(async () => {
      await request(`/api/databases/${database.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name })
      });
      await refresh();
    }, '重命名表格失败。');
  }

  async function createField(block: DashboardBlock) {
    if (!newFieldName.trim()) return;
    await runSaving(async () => {
      const options = parseOptions(newFieldOptions);
      const config = ['single_select', 'multi_select', 'status'].includes(newFieldType)
        ? {
            version: 1,
            options,
            completion:
              newFieldType === 'status' && options.at(-1)
                ? { completedOptionIds: [options.at(-1)!.id] }
                : undefined
          }
        : { version: 1 };
      const field = await request<Field>(`/api/databases/${block.view.database.id}/fields`, {
        method: 'POST',
        body: JSON.stringify({ name: newFieldName.trim(), type: newFieldType, config })
      });
      await request(`/api/views/${block.view.view.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          config: {
            ...block.view.view.config,
            visibleFieldIds: [...block.view.view.config.visibleFieldIds, field.id]
          }
        })
      });
      setAddingFieldDatabaseId(undefined);
      setNewFieldName('');
      setNewFieldType('short_text');
      setNewFieldOptions('未开始, 进行中, 已完成');
      await refresh();
    }, '添加列失败。');
  }

  async function renameField(field: Field) {
    const name = fieldNameDrafts[field.id]?.trim();
    if (!name || name === field.name) return;
    await runSaving(async () => {
      await request(`/api/fields/${field.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name })
      });
      await refresh();
    }, '重命名列失败。');
  }

  async function addRecord(block: DashboardBlock) {
    const drafts = newRecordDrafts[block.view.database.id] ?? {};
    await runSaving(async () => {
      await request(`/api/databases/${block.view.database.id}/records`, {
        method: 'POST',
        body: JSON.stringify({ values: serializeValues(block.view.fields, drafts) })
      });
      setNewRecordDrafts((current) => ({ ...current, [block.view.database.id]: {} }));
      await refresh();
    }, '新增记录失败。');
  }

  async function saveCell(
    block: DashboardBlock,
    record: RecordRow,
    field: Field,
    value: EditableValue
  ) {
    const persistedValue = toEditableValue(field, record);
    if (JSON.stringify(persistedValue) === JSON.stringify(value)) return;
    const nextDraft = { ...(recordDrafts[record.id] ?? {}), [field.id]: value };
    setRecordDrafts((current) => ({ ...current, [record.id]: nextDraft }));
    try {
      await request(`/api/records/${record.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ values: serializeValues(block.view.fields, nextDraft) })
      });
      setNotice('已自动保存');
    } catch (requestError) {
      setError(readError(requestError, '保存单元格失败。'));
    }
  }

  async function archiveRecord(record: RecordRow) {
    await runSaving(async () => {
      await request(`/api/records/${record.id}/archive`, { method: 'POST' });
      await refresh();
    }, '删除记录失败。');
  }

  async function applyFilter(block: DashboardBlock, clear = false) {
    const draft = filterDrafts[block.view.view.id];
    if (!draft && !clear) return;
    await runSaving(async () => {
      const filter = clear ? null : buildFilter(draft!);
      await request(`/api/views/${block.view.view.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ config: { ...block.view.view.config, filter } })
      });
      await refresh();
    }, '保存筛选失败。');
  }

  async function toggleBlock(block: DashboardBlock) {
    await runSaving(async () => {
      await request(`/api/dashboard-blocks/${block.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isCollapsed: !block.isCollapsed })
      });
      await refresh();
    }, '折叠表格失败。');
  }

  async function downloadBackup() {
    try {
      const response = await fetch('/api/workspace/backup');
      if (!response.ok) throw new Error('备份失败');
      downloadBlob(await response.blob(), 'ProjectManagerWorkspace.pmdbackup');
    } catch (requestError) {
      setError(readError(requestError, '备份失败。'));
    }
  }

  function reportQuery() {
    const query = new URLSearchParams();
    if (reportTitle.trim()) query.set('title', reportTitle.trim());
    if (reportPeriod.trim()) query.set('period', reportPeriod.trim());
    query.set('includeCompleted', String(includeCompleted));
    query.set('includeEmptySections', 'false');
    query.set('highlightStatus', 'true');
    query.set('density', 'comfortable');
    return query.toString();
  }

  async function downloadExport(kind: 'editable' | 'presentation') {
    if (!dashboard) return;
    await runSaving(async () => {
      const response = await fetch(
        `/api/dashboards/${dashboard.dashboard.id}/export/${kind}.xlsx?${reportQuery()}`
      );
      if (!response.ok) throw new Error('导出失败');
      const label = kind === 'editable' ? '可编辑数据' : '展示版';
      downloadBlob(
        await response.blob(),
        `${reportTitle.trim() || dashboard.dashboard.name}-${label}.xlsx`
      );
    }, '导出 Excel 失败。');
  }

  async function copyOutlookReport() {
    if (!dashboard) return;
    await runSaving(async () => {
      const response = await fetch(
        `/api/dashboards/${dashboard.dashboard.id}/export/outlook.html?${reportQuery()}`
      );
      if (!response.ok) throw new Error('生成邮件失败');
      const html = await response.text();
      const text = new DOMParser().parseFromString(html, 'text/html').body.innerText;
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })
      ]);
      setNotice('邮件内容已复制，可粘贴到 Outlook。');
    }, '复制 Outlook 内容失败。');
  }

  async function createOutlookDraft() {
    if (!dashboard) return;
    await runSaving(async () => {
      await request(
        `/api/dashboards/${dashboard.dashboard.id}/export/outlook-draft?${reportQuery()}`,
        {
          method: 'POST',
          headers: { 'x-project-manager-action': 'create-outlook-draft' }
        }
      );
      setNotice('已打开 Outlook 草稿，请检查后自行发送。');
    }, '当前环境无法创建 Outlook 草稿，请使用复制邮件内容。');
  }

  function downloadOutlookHtml() {
    if (!dashboard) return;
    const anchor = document.createElement('a');
    anchor.href = `/api/dashboards/${dashboard.dashboard.id}/export/outlook.html?${reportQuery()}`;
    anchor.download = `${reportTitle.trim() || dashboard.dashboard.name}-Outlook报告.html`;
    anchor.click();
  }

  async function runSaving(action: () => Promise<void>, fallback: string) {
    setIsSaving(true);
    setError(undefined);
    try {
      await action();
    } catch (requestError) {
      setError(readError(requestError, fallback));
    } finally {
      setIsSaving(false);
    }
  }

  if (showAdvanced) {
    return (
      <div className="advanced-surface">
        <button
          className="return-to-workspace"
          onClick={() => {
            setShowAdvanced(false);
            void refresh();
          }}
          type="button"
        >
          ← 返回项目工作台
        </button>
        <AdvancedApp />
      </div>
    );
  }

  return (
    <div className="notion-shell">
      <aside className="notion-sidebar" aria-label="工作区导航">
        <div className="notion-brand">
          <span>PM</span>
          <strong>我的项目</strong>
        </div>
        <button className="sidebar-home is-active" type="button">
          <span>▦</span> 项目工作台
        </button>
        <div className="sidebar-section-title">当前页面</div>
        <nav className="sidebar-tables">
          {dashboard?.blocks.map((block) => (
            <a href={`#table-${block.view.database.id}`} key={block.id}>
              <span className="table-icon">▤</span>
              {block.view.database.name}
            </a>
          ))}
        </nav>
        <button className="sidebar-add" onClick={() => setIsAddingTable(true)} type="button">
          ＋ 新建表格
        </button>
        <details className="sidebar-settings">
          <summary>设置与备份</summary>
          <button onClick={() => void downloadBackup()} type="button">
            下载工作区备份
          </button>
          <button onClick={() => setShowAdvanced(true)} type="button">
            备份恢复和高级设置
          </button>
          <span>{health === 'ready' ? '本地数据已连接' : '正在连接本地数据'}</span>
        </details>
      </aside>

      <main className="notion-workspace">
        <header className="workspace-header">
          <div>
            <div className="page-icon">▦</div>
            <input
              aria-label="工作台名称"
              className="workspace-title"
              readOnly
              value={dashboard?.dashboard.name ?? '项目工作台'}
            />
            <p>把不同结构的表格放在同一个页面里，直接编辑、筛选和导出。</p>
          </div>
          <div className={`connection-pill ${health}`}>
            <span />{' '}
            {health === 'ready' ? '已保存到本机' : health === 'loading' ? '正在打开' : '连接失败'}
          </div>
        </header>

        <div className="workspace-toolbar">
          <button className="primary-action" onClick={() => setIsAddingTable(true)} type="button">
            ＋ 新建表格
          </button>
          <details className="export-menu">
            <summary>导出</summary>
            <div className="export-popover">
              <label>
                报告标题
                <input
                  value={reportTitle}
                  onChange={(event) => setReportTitle(event.target.value)}
                  placeholder={dashboard?.dashboard.name ?? '项目工作台'}
                />
              </label>
              <label>
                报告周期
                <input
                  value={reportPeriod}
                  onChange={(event) => setReportPeriod(event.target.value)}
                  placeholder="例如：2026 年第 32 周"
                />
              </label>
              <label className="compact-check">
                <input
                  checked={includeCompleted}
                  onChange={(event) => setIncludeCompleted(event.target.checked)}
                  type="checkbox"
                />
                包含已完成事项
              </label>
              <button onClick={() => void downloadExport('editable')} type="button">
                下载可编辑 Excel
              </button>
              <button onClick={() => void downloadExport('presentation')} type="button">
                下载展示版 Excel
              </button>
              <button onClick={() => void copyOutlookReport()} type="button">
                复制到 Outlook
              </button>
              <button onClick={() => void createOutlookDraft()} type="button">
                创建 Outlook 草稿
              </button>
              <button onClick={downloadOutlookHtml} type="button">
                下载 Outlook HTML
              </button>
            </div>
          </details>
          <span className="workspace-stats">
            {blockCount} 个表格 · {recordCount} 条记录
          </span>
        </div>

        {error && <div className="canvas-error">{error}</div>}
        {notice && (
          <div className="canvas-notice" onAnimationEnd={() => setNotice(undefined)}>
            {notice}
          </div>
        )}

        {isAddingTable && (
          <form className="inline-create-table" onSubmit={createTable}>
            <div>
              <strong>新建表格</strong>
              <span>它会直接出现在这个页面，不需要再配置看板。</span>
            </div>
            <input
              autoFocus
              value={tableName}
              onChange={(event) => setTableName(event.target.value)}
              placeholder="例如：关键风险"
            />
            <input
              value={tableDescription}
              onChange={(event) => setTableDescription(event.target.value)}
              placeholder="说明（可选）"
            />
            <button
              className="primary-action"
              disabled={isSaving || !tableName.trim()}
              type="submit"
            >
              创建
            </button>
            <button onClick={() => setIsAddingTable(false)} type="button">
              取消
            </button>
          </form>
        )}

        <div className="table-stack">
          {dashboard?.blocks.map((block) => {
            const visibleFields = block.view.view.config.visibleFieldIds
              .map((id) => block.view.fields.find((field) => field.id === id))
              .filter((field): field is Field => Boolean(field));
            const filterDraft = filterDrafts[block.view.view.id];
            return (
              <section
                className="notion-table-block"
                id={`table-${block.view.database.id}`}
                key={block.id}
              >
                <div className="table-block-header">
                  <div className="table-title-wrap">
                    <span className="table-title-icon">▤</span>
                    <input
                      aria-label={`${block.view.database.name}表格名称`}
                      className="table-title-input"
                      value={databaseNameDrafts[block.view.database.id] ?? block.view.database.name}
                      onChange={(event) =>
                        setDatabaseNameDrafts((current) => ({
                          ...current,
                          [block.view.database.id]: event.target.value
                        }))
                      }
                      onBlur={() => void renameDatabase(block.view.database)}
                    />
                  </div>
                  <div className="table-toolbar">
                    <details className="filter-menu">
                      <summary>{block.view.view.config.filter ? '筛选 · 1' : '筛选'}</summary>
                      <div className="filter-popover">
                        {visibleFields.length === 0 ? (
                          <span>添加列后即可筛选</span>
                        ) : (
                          <>
                            <select
                              value={filterDraft?.fieldId ?? ''}
                              onChange={(event) => {
                                const field = visibleFields.find(
                                  (item) => item.id === event.target.value
                                );
                                setFilterDrafts((current) => ({
                                  ...current,
                                  [block.view.view.id]: {
                                    fieldId: event.target.value,
                                    operator: defaultFilterOperator(field?.type),
                                    value: ''
                                  }
                                }));
                              }}
                            >
                              {visibleFields.map((field) => (
                                <option key={field.id} value={field.id}>
                                  {field.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={filterDraft?.operator ?? 'contains'}
                              onChange={(event) =>
                                setFilterDrafts((current) => ({
                                  ...current,
                                  [block.view.view.id]: {
                                    ...current[block.view.view.id]!,
                                    operator: event.target.value as FilterOperator
                                  }
                                }))
                              }
                            >
                              {filterOperatorsForField(
                                visibleFields.find((field) => field.id === filterDraft?.fieldId)
                                  ?.type
                              ).map((operator) => (
                                <option key={operator} value={operator}>
                                  {filterLabels[operator] ?? operator}
                                </option>
                              ))}
                            </select>
                            {filterDraft && !filterNeedsNoValue(filterDraft.operator) && (
                              <FilterValue
                                field={visibleFields.find(
                                  (field) => field.id === filterDraft.fieldId
                                )}
                                value={filterDraft.value}
                                onChange={(value) =>
                                  setFilterDrafts((current) => ({
                                    ...current,
                                    [block.view.view.id]: { ...current[block.view.view.id]!, value }
                                  }))
                                }
                              />
                            )}
                            <div className="filter-actions">
                              <button
                                className="primary-action"
                                onClick={() => void applyFilter(block)}
                                type="button"
                              >
                                应用
                              </button>
                              <button onClick={() => void applyFilter(block, true)} type="button">
                                清除
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </details>
                    <button onClick={() => void toggleBlock(block)} type="button">
                      {block.isCollapsed ? '展开' : '折叠'}
                    </button>
                    <button
                      onClick={() => {
                        setAddingFieldDatabaseId(block.view.database.id);
                        setNewFieldName('');
                      }}
                      type="button"
                    >
                      ＋ 添加列
                    </button>
                  </div>
                </div>
                {block.view.database.description && (
                  <p className="table-description">{block.view.database.description}</p>
                )}

                {addingFieldDatabaseId === block.view.database.id && (
                  <div className="inline-add-field">
                    <input
                      autoFocus
                      value={newFieldName}
                      onChange={(event) => setNewFieldName(event.target.value)}
                      placeholder="列名称，例如：风险消减措施"
                    />
                    <select
                      value={newFieldType}
                      onChange={(event) => setNewFieldType(event.target.value as FieldType)}
                    >
                      {fieldTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                    {['single_select', 'multi_select', 'status'].includes(newFieldType) && (
                      <input
                        value={newFieldOptions}
                        onChange={(event) => setNewFieldOptions(event.target.value)}
                        placeholder="选项，用逗号分隔"
                      />
                    )}
                    <button
                      className="primary-action"
                      disabled={!newFieldName.trim() || isSaving}
                      onClick={() => void createField(block)}
                      type="button"
                    >
                      添加
                    </button>
                    <button onClick={() => setAddingFieldDatabaseId(undefined)} type="button">
                      取消
                    </button>
                  </div>
                )}

                {!block.isCollapsed && (
                  <div className="notion-table-scroll">
                    <table className="notion-table">
                      <thead>
                        <tr>
                          {visibleFields.map((field) => (
                            <th
                              key={field.id}
                              style={{
                                width:
                                  block.view.view.config.fieldWidths[field.id] ??
                                  defaultColumnWidth(field.type)
                              }}
                            >
                              <div className="column-heading">
                                <span className="column-type">{fieldTypeIcon(field.type)}</span>
                                <input
                                  aria-label={`${field.name}列名称`}
                                  value={fieldNameDrafts[field.id] ?? field.name}
                                  onChange={(event) =>
                                    setFieldNameDrafts((current) => ({
                                      ...current,
                                      [field.id]: event.target.value
                                    }))
                                  }
                                  onBlur={() => void renameField(field)}
                                />
                                <details>
                                  <summary aria-label={`${field.name}列菜单`}>···</summary>
                                  <div className="column-menu">
                                    <span>
                                      {fieldTypes.find((type) => type.value === field.type)?.label}
                                    </span>
                                    <span>直接修改表头文字即可重命名</span>
                                  </div>
                                </details>
                              </div>
                            </th>
                          ))}
                          <th className="add-column-heading">
                            <button
                              onClick={() => setAddingFieldDatabaseId(block.view.database.id)}
                              type="button"
                            >
                              ＋
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {block.view.records.map((record) => (
                          <tr key={record.id}>
                            {visibleFields.map((field) => (
                              <td key={field.id}>
                                <RecordCell
                                  field={field}
                                  value={
                                    recordDrafts[record.id]?.[field.id] ??
                                    toEditableValue(field, record)
                                  }
                                  onChange={(value) =>
                                    setRecordDrafts((current) => ({
                                      ...current,
                                      [record.id]: { ...current[record.id], [field.id]: value }
                                    }))
                                  }
                                  onCommit={(value) => void saveCell(block, record, field, value)}
                                />
                              </td>
                            ))}
                            <td className="row-menu">
                              <button
                                aria-label="删除记录"
                                onClick={() => void archiveRecord(record)}
                                type="button"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                        {visibleFields.length > 0 && (
                          <tr className="new-record-row">
                            {visibleFields.map((field) => (
                              <td key={field.id}>
                                <RecordCell
                                  field={field}
                                  value={
                                    newRecordDrafts[block.view.database.id]?.[field.id] ??
                                    defaultValue(field)
                                  }
                                  onChange={(value) =>
                                    setNewRecordDrafts((current) => ({
                                      ...current,
                                      [block.view.database.id]: {
                                        ...current[block.view.database.id],
                                        [field.id]: value
                                      }
                                    }))
                                  }
                                />
                              </td>
                            ))}
                            <td>
                              <button
                                className="add-row-button"
                                onClick={() => void addRecord(block)}
                                type="button"
                              >
                                新增
                              </button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {visibleFields.length === 0 && (
                      <button
                        className="empty-table-action"
                        onClick={() => setAddingFieldDatabaseId(block.view.database.id)}
                        type="button"
                      >
                        ＋ 添加第一列
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function RecordCell({
  field,
  value,
  onChange,
  onCommit
}: {
  field: Field;
  value: EditableValue;
  onChange: (value: EditableValue) => void;
  onCommit?: (value: EditableValue) => void;
}) {
  if (field.type === 'sequence')
    return <span className="sequence-cell">{String(value) || '自动'}</span>;
  if (field.type === 'checkbox')
    return (
      <input
        aria-label={field.name}
        checked={value === true}
        onChange={(event) => {
          onChange(event.target.checked);
          onCommit?.(event.target.checked);
        }}
        type="checkbox"
      />
    );
  if (field.type === 'single_select' || field.type === 'status')
    return (
      <select
        aria-label={field.name}
        value={String(value)}
        onChange={(event) => {
          onChange(event.target.value);
          onCommit?.(event.target.value);
        }}
      >
        <option value="">未选择</option>
        {field.config.options?.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  if (field.type === 'multi_select')
    return (
      <select
        aria-label={field.name}
        multiple
        value={Array.isArray(value) ? value : []}
        onChange={(event) => {
          const next = Array.from(event.target.selectedOptions, (option) => option.value);
          onChange(next);
          onCommit?.(next);
        }}
      >
        {field.config.options?.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  if (field.type === 'long_text')
    return (
      <textarea
        aria-label={field.name}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onCommit?.(event.target.value)}
      />
    );
  return (
    <input
      aria-label={field.name}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => onCommit?.(event.target.value)}
    />
  );
}

function FilterValue({
  field,
  value,
  onChange
}: {
  field?: Field;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field && ['single_select', 'status', 'multi_select'].includes(field.type))
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">选择值</option>
        {field.config.options?.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  return (
    <input
      type={
        field?.type === 'number' || field?.type === 'sequence'
          ? 'number'
          : field?.type === 'date'
            ? 'date'
            : 'text'
      }
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="筛选值"
    />
  );
}

function fieldTypeIcon(type: FieldType) {
  if (type === 'sequence' || type === 'number') return '#';
  if (type === 'date') return '◷';
  if (type === 'status' || type === 'single_select' || type === 'multi_select') return '●';
  if (type === 'checkbox') return '☑';
  if (type === 'person') return '人';
  return 'Aa';
}

function defaultColumnWidth(type: FieldType) {
  if (type === 'sequence') return 90;
  if (type === 'date' || type === 'person' || type === 'status') return 150;
  if (type === 'long_text') return 320;
  return 210;
}

function defaultValue(field: Field): EditableValue {
  if (field.type === 'checkbox') return false;
  if (field.type === 'multi_select') return [];
  return '';
}

function toEditableValue(field: Field, record: RecordRow): EditableValue {
  if (field.type === 'sequence') return String(record.sequenceNumber);
  const value = record.values[field.id];
  if (value === undefined || value === null) return defaultValue(field);
  return Array.isArray(value) || typeof value === 'boolean' ? value : String(value);
}

function serializeValues(fields: Field[], drafts: Record<string, EditableValue>) {
  return Object.fromEntries(
    fields.flatMap((field) => {
      if (field.type === 'sequence') return [];
      const value = drafts[field.id] ?? defaultValue(field);
      if (value === '' || (Array.isArray(value) && value.length === 0)) return [];
      return [[field.id, field.type === 'number' ? Number(value) : value]];
    })
  );
}

function parseOptions(input: string) {
  return input
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label, index) => ({ id: `option-${index + 1}`, label }));
}

function filterOperatorsForField(type?: FieldType): FilterOperator[] {
  if (type === 'checkbox') return ['is_checked', 'is_not_checked'];
  if (type === 'number' || type === 'sequence')
    return ['equals', 'not_equals', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'];
  if (type === 'date')
    return ['equals', 'not_equals', 'before', 'after', 'is_empty', 'is_not_empty'];
  if (type === 'single_select' || type === 'status')
    return ['equals', 'not_equals', 'is_empty', 'is_not_empty'];
  if (type === 'multi_select') return ['contains_any', 'contains_none', 'is_empty', 'is_not_empty'];
  return ['contains', 'not_contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'];
}

function defaultFilterOperator(type?: FieldType): FilterOperator {
  return filterOperatorsForField(type)[0] ?? 'contains';
}

function filterNeedsNoValue(operator: FilterOperator) {
  return ['is_empty', 'is_not_empty', 'is_checked', 'is_not_checked'].includes(operator);
}

function buildFilter(draft: FilterDraft): FilterCondition | null {
  if (!draft.fieldId) return null;
  if (filterNeedsNoValue(draft.operator))
    return { kind: 'condition', fieldId: draft.fieldId, operator: draft.operator };
  if (!draft.value) return null;
  const value = ['greater_than', 'less_than'].includes(draft.operator)
    ? Number(draft.value)
    : ['contains_any', 'contains_none'].includes(draft.operator)
      ? [draft.value]
      : draft.value;
  return { kind: 'condition', fieldId: draft.fieldId, operator: draft.operator, value };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init?.headers
    }
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      { message?: string } | undefined;
    throw new Error(payload?.message ?? `请求失败（${response.status}）`);
  }
  return (await response.json()) as T;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function readError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
