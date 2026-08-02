import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { FieldType, HealthResponse } from '@project-manager/domain';

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

  const selectedDatabase = useMemo(
    () => databases.find((database) => database.id === selectedDatabaseId),
    [databases, selectedDatabaseId]
  );

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (selectedDatabaseId) {
      void loadDetail(selectedDatabaseId);
    } else {
      setDetail(undefined);
    }
  }, [selectedDatabaseId]);

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
    } catch (requestError) {
      setError(readRequestError(requestError, '新增记录失败。'));
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
    } catch (requestError) {
      setError(readRequestError(requestError, '保存记录失败。'));
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
          </div>
          <div className={`health ${health.kind}`} aria-live="polite">
            <span className="health-dot" />
            {health.kind === 'ready' && 'SQLite 已就绪'}
            {health.kind === 'loading' && '正在连接'}
            {health.kind === 'error' && '服务不可用'}
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

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
                  <span className="record-count">{detail.records.length} 条记录</span>
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
                        {detail.fields.map((field) => (
                          <th key={field.id}>{field.name}</th>
                        ))}
                        <th className="record-action-heading">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isAddingRecord && (
                        <tr className="record-editor-row">
                          {detail.fields.map((field) => (
                            <td key={field.id}>
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
                      {detail.records.length === 0 ? (
                        <tr>
                          <td className="empty-cell" colSpan={detail.fields.length + 1}>
                            暂无记录。点击“新建记录”开始填写。
                          </td>
                        </tr>
                      ) : (
                        detail.records.map((record) => (
                          <tr key={record.id}>
                            {detail.fields.map((field) => (
                              <td key={field.id}>
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
