import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
  config: { version: 1; options?: Array<{ id: string; label: string; color?: string }> };
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
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });
  const [databases, setDatabases] = useState<DatabaseSummary[]>([]);
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
  const [databaseName, setDatabaseName] = useState('');
  const [databaseDescription, setDatabaseDescription] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('short_text');
  const [optionLabels, setOptionLabels] = useState('未开始, 进行中, 已完成');
  const [fieldNameDrafts, setFieldNameDrafts] = useState<Record<string, string>>({});
  const [newRecordValues, setNewRecordValues] = useState<Record<string, EditableValue>>({});
  const [recordValueDrafts, setRecordValueDrafts] = useState<
    Record<string, Record<string, EditableValue>>
  >({});
  const [lastArchived, setLastArchived] = useState<
    { kind: '数据库' | '字段' | '记录'; id: string } | undefined
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
      const [healthResponse, databaseList] = await Promise.all([
        request<HealthResponse>('/api/health'),
        request<DatabaseSummary[]>('/api/databases')
      ]);
      setHealth({ kind: 'ready', response: healthResponse });
      setDatabases(databaseList);
      setSelectedDatabaseId((current) => current ?? databaseList[0]?.id);
    } catch {
      setHealth({ kind: 'error' });
      setError('无法连接本地服务。请确认 API 已启动。');
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
      const config = optionFieldTypes.has(fieldType)
        ? {
            version: 1,
            options: optionLabels
              .split(',')
              .map((label) => label.trim())
              .filter(Boolean)
              .map((label, index) => ({ id: `option-${index + 1}`, label }))
          }
        : { version: 1 };
      await request<Field>(`/api/databases/${selectedDatabaseId}/fields`, {
        method: 'POST',
        body: JSON.stringify({ name: fieldName, type: fieldType, config })
      });
      setFieldName('');
      setFieldType('short_text');
      setOptionLabels('未开始, 进行中, 已完成');
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
    } catch (requestError) {
      setError(readRequestError(requestError, '保存字段名称失败。'));
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
    } catch (requestError) {
      setError(readRequestError(requestError, '保存记录失败。'));
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveItem(kind: '数据库' | '字段' | '记录', id: string) {
    const resource = kind === '数据库' ? 'databases' : kind === '字段' ? 'fields' : 'records';
    setIsSaving(true);
    setError(undefined);
    try {
      await request(`/${'api'}/${resource}/${id}/archive`, { method: 'POST' });
      setLastArchived({ kind, id });
      if (kind === '数据库') {
        const databaseList = await request<DatabaseSummary[]>('/api/databases');
        setDatabases(databaseList);
        setSelectedDatabaseId(databaseList[0]?.id);
      } else if (selectedDatabaseId) {
        await loadDetail(selectedDatabaseId);
        await refreshSelectedView();
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
    const resource = kind === '数据库' ? 'databases' : kind === '字段' ? 'fields' : 'records';
    setIsSaving(true);
    try {
      await request(`/${'api'}/${resource}/${id}/restore`, { method: 'POST' });
      const databaseList = await request<DatabaseSummary[]>('/api/databases');
      setDatabases(databaseList);
      if (kind === '数据库') setSelectedDatabaseId(id);
      else if (selectedDatabaseId) {
        await loadDetail(selectedDatabaseId);
        await refreshSelectedView();
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
          onClick={() => setIsCreatingDatabase(true)}
          type="button"
        >
          ＋ 新建数据库
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

        {error && <div className="error-banner">{error}</div>}
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
                  <div className="field-row" key={field.id}>
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
                        onChange={(event) => setOptionLabels(event.target.value)}
                        placeholder="未开始, 进行中, 已完成"
                      />
                    </label>
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
