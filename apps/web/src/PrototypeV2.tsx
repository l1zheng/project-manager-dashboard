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

type PrototypeColumnType = 'sequence' | 'text' | 'person' | 'date' | 'status' | 'number';

type PrototypeColumn = {
  id: string;
  name: string;
  type: PrototypeColumnType;
  width: number;
  options?: string[];
  reportAlign?: 'left' | 'center';
  reportEmphasis?: 'strong';
};

type PrototypeRow = {
  id: string;
  values: Record<string, string>;
};

type PrototypeFilter = {
  columnId: string;
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
  | { id: string; kind: 'text'; content: string }
  | { id: string; kind: 'image'; src?: string; fileName?: string; caption: string };

type PopoverState =
  | { kind: 'column'; anchor: HTMLElement; tableId: string; columnId: string }
  | { kind: 'filter'; anchor: HTMLElement; tableId: string }
  | { kind: 'table'; anchor: HTMLElement; tableId: string }
  | { kind: 'row'; anchor: HTMLElement; tableId: string; rowId: string }
  | { kind: 'content'; anchor: HTMLElement; blockId: string }
  | { kind: 'export'; anchor: HTMLElement }
  | { kind: 'add-module'; anchor: HTMLElement };

type DestructiveConfirmation = 'column' | 'table' | 'row' | 'content';

type PreviewMode = 'report' | 'excel';

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

const initialTables: PrototypeTable[] = [
  {
    id: 'requirements',
    name: '需求跟踪',
    icon: '▤',
    columns: [
      { id: 'req-sequence', name: '序号', type: 'sequence', width: 76 },
      {
        id: 'req-number',
        name: '需求号',
        type: 'text',
        width: 138,
        reportAlign: 'center'
      },
      {
        id: 'req-title',
        name: '需求描述',
        type: 'text',
        width: 250,
        reportEmphasis: 'strong'
      },
      { id: 'req-progress', name: '当前进展', type: 'text', width: 320 },
      { id: 'req-plan', name: '交付计划', type: 'date', width: 150 },
      { id: 'req-owner', name: '责任人', type: 'person', width: 140 },
      {
        id: 'req-status',
        name: '状态',
        type: 'status',
        width: 132,
        options: ['未开始', '进行中', '已完成']
      }
    ],
    rows: [
      {
        id: 'req-1',
        values: {
          'req-number': 'REQ-023',
          'req-title': '支持周报导出模板',
          'req-progress': '字段映射已完成，正在验证复杂表格排版。',
          'req-plan': '2026-08-16',
          'req-owner': '李正',
          'req-status': '进行中'
        }
      },
      {
        id: 'req-2',
        values: {
          'req-number': 'REQ-024',
          'req-title': '统一状态完成语义',
          'req-progress': '完成规则已经写入字段属性。',
          'req-plan': '2026-08-18',
          'req-owner': '李正',
          'req-status': '未开始'
        }
      }
    ]
  },
  {
    id: 'risks',
    name: '关键风险',
    icon: '▤',
    columns: [
      { id: 'risk-sequence', name: '序号', type: 'sequence', width: 76 },
      { id: 'risk-description', name: '风险描述', type: 'text', width: 290 },
      { id: 'risk-mitigation', name: '风险消减措施', type: 'text', width: 380 },
      { id: 'risk-owner', name: '责任人', type: 'person', width: 150 },
      {
        id: 'risk-status',
        name: '状态',
        type: 'status',
        width: 132,
        options: ['Open', 'Suspended', 'Closed']
      }
    ],
    rows: [
      {
        id: 'risk-1',
        values: {
          'risk-description': 'Windows 经典 Outlook 的企业策略差异',
          'risk-mitigation': '保留 HTML 下载和富文本复制回退，并在目标电脑复验。',
          'risk-owner': '李正',
          'risk-status': 'Open'
        }
      }
    ]
  }
];

const initialPageBlocks: PrototypePageBlock[] = [
  { id: 'block-requirements', kind: 'table', tableId: 'requirements' },
  { id: 'block-risks', kind: 'table', tableId: 'risks' }
];

export function PrototypeV2() {
  const [tables, setTables] = useState(initialTables);
  const [pageBlocks, setPageBlocks] = useState(initialPageBlocks);
  const [popover, setPopover] = useState<PopoverState>();
  const [propertyDraft, setPropertyDraft] = useState<PrototypeColumn>();
  const [filterDraft, setFilterDraft] = useState<PrototypeFilter>({ columnId: '', keyword: '' });
  const [newTableName, setNewTableName] = useState('');
  const [moduleComposer, setModuleComposer] = useState<'table'>();
  const [destructiveConfirmation, setDestructiveConfirmation] = useState<DestructiveConfirmation>();
  const [blankRowDrafts, setBlankRowDrafts] = useState<Record<string, Record<string, string>>>({});
  const [draggingColumn, setDraggingColumn] = useState<{ tableId: string; columnId: string }>();
  const [resizingColumn, setResizingColumn] = useState<{ tableId: string; columnId: string }>();
  const [previewMode, setPreviewMode] = useState<PreviewMode>();
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    title: '项目工作台',
    period: '2026 年第 32 周',
    includeCompleted: true,
    includeEmpty: true
  });
  const [notice, setNotice] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  const closePopover = () => {
    setPopover(undefined);
    setPropertyDraft(undefined);
    setDestructiveConfirmation(undefined);
    setModuleComposer(undefined);
  };

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
    setTables((current) => current.map((table) => (table.id === tableId ? update(table) : table)));
  }

  function openColumnEditor(table: PrototypeTable, column: PrototypeColumn, anchor: HTMLElement) {
    setDestructiveConfirmation(undefined);
    setPropertyDraft({ ...column, options: column.options ? [...column.options] : undefined });
    setPopover({ kind: 'column', anchor, tableId: table.id, columnId: column.id });
  }

  function saveColumnProperty() {
    if (!popover || popover.kind !== 'column' || !propertyDraft?.name.trim()) return;
    updateTable(popover.tableId, (table) => ({
      ...table,
      columns: table.columns.map((column) =>
        column.id === popover.columnId
          ? { ...propertyDraft, name: propertyDraft.name.trim() }
          : column
      )
    }));
    setNotice(`已更新属性“${propertyDraft.name.trim()}”`);
    closePopover();
  }

  function deleteColumn(tableId: string, columnId: string) {
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
  }

  function duplicateTable(tableId: string) {
    const source = tables.find((table) => table.id === tableId);
    if (!source) return;
    const id = `table-${crypto.randomUUID()}`;
    const columnIdMap = new Map(
      source.columns.map((column) => [column.id, `column-${crypto.randomUUID()}`])
    );
    const copy: PrototypeTable = {
      ...source,
      id,
      name: `${source.name} 副本`,
      columns: source.columns.map((column) => ({
        ...column,
        id: columnIdMap.get(column.id)!,
        options: column.options ? [...column.options] : undefined
      })),
      rows: source.rows.map((row) => ({
        id: `row-${crypto.randomUUID()}`,
        values: Object.fromEntries(
          Object.entries(row.values).flatMap(([columnId, value]) => {
            const copiedColumnId = columnIdMap.get(columnId);
            return copiedColumnId ? [[copiedColumnId, value]] : [];
          })
        )
      })),
      filter: source.filter
        ? {
            ...source.filter,
            columnId: columnIdMap.get(source.filter.columnId)!
          }
        : undefined
    };
    setTables((current) => {
      const sourceIndex = current.findIndex((table) => table.id === tableId);
      if (sourceIndex < 0) return [...current, copy];
      const next = [...current];
      next.splice(sourceIndex + 1, 0, copy);
      return next;
    });
    setPageBlocks((current) => {
      const sourceIndex = current.findIndex(
        (block) => block.kind === 'table' && block.tableId === tableId
      );
      const copyBlock: PrototypePageBlock = {
        id: `block-${crypto.randomUUID()}`,
        kind: 'table',
        tableId: id
      };
      if (sourceIndex < 0) return [...current, copyBlock];
      const next = [...current];
      next.splice(sourceIndex + 1, 0, copyBlock);
      return next;
    });
    setNotice('已复制表格，副本保留列结构和当前记录。');
    closePopover();
  }

  function deleteTable(tableId: string) {
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
  }

  function duplicateRow(tableId: string, rowId: string) {
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
  }

  function deleteRow(tableId: string, rowId: string) {
    updateTable(tableId, (table) => ({
      ...table,
      rows: table.rows.filter((row) => row.id !== rowId)
    }));
    setNotice('已删除记录。');
    closePopover();
  }

  function openFilter(table: PrototypeTable, anchor: HTMLElement) {
    setFilterDraft(
      table.filter ?? {
        columnId: table.columns.find((column) => column.type !== 'sequence')?.id ?? '',
        keyword: ''
      }
    );
    setPopover({ kind: 'filter', anchor, tableId: table.id });
  }

  function applyFilter(tableId: string) {
    updateTable(tableId, (table) => ({
      ...table,
      filter: filterDraft.keyword.trim()
        ? { ...filterDraft, keyword: filterDraft.keyword.trim() }
        : undefined
    }));
    closePopover();
  }

  function addTable() {
    const name = newTableName.trim();
    if (!name) return;
    const id = `table-${crypto.randomUUID()}`;
    setTables((current) => [
      ...current,
      {
        id,
        name,
        icon: '▤',
        columns: [
          { id: `${id}-sequence`, name: '序号', type: 'sequence', width: 76 },
          { id: `${id}-title`, name: '名称', type: 'text', width: 300 },
          {
            id: `${id}-status`,
            name: '状态',
            type: 'status',
            width: 132,
            options: ['未开始', '进行中', '已完成']
          }
        ],
        rows: []
      }
    ]);
    setPageBlocks((current) => [
      ...current,
      { id: `block-${crypto.randomUUID()}`, kind: 'table', tableId: id }
    ]);
    setNewTableName('');
    setModuleComposer(undefined);
    closePopover();
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    );
  }

  function addTextBlock() {
    const id = `block-${crypto.randomUUID()}`;
    setPageBlocks((current) => [
      ...current,
      { id, kind: 'text', content: '在这里输入说明、结论或本周摘要。' }
    ]);
    setNotice('已添加文字模块。');
    closePopover();
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    );
  }

  function addImageBlock() {
    const id = `block-${crypto.randomUUID()}`;
    setPageBlocks((current) => [...current, { id, kind: 'image', caption: '' }]);
    setNotice('已添加图片模块，请从本机选择图片。');
    closePopover();
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    );
  }

  function updatePageBlock(
    blockId: string,
    update: (block: PrototypePageBlock) => PrototypePageBlock
  ) {
    setPageBlocks((current) =>
      current.map((block) => (block.id === blockId ? update(block) : block))
    );
  }

  function loadImage(blockId: string, file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setNotice('请选择 PNG、JPEG、WebP 或 GIF 图片。');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNotice('原型中的图片不能超过 10 MB。');
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') return;
      updatePageBlock(blockId, (block) =>
        block.kind === 'image'
          ? { ...block, src: reader.result as string, fileName: file.name }
          : block
      );
      setNotice(`已载入图片“${file.name}” · 仅保存在当前页面`);
    });
    reader.readAsDataURL(file);
  }

  function deleteContentBlock(blockId: string) {
    setPageBlocks((current) => current.filter((block) => block.id !== blockId));
    setNotice('已删除页面模块。');
    closePopover();
  }

  function addColumn(tableId: string) {
    const column: PrototypeColumn = {
      id: `column-${crypto.randomUUID()}`,
      name: '新属性',
      type: 'text',
      width: 200
    };
    updateTable(tableId, (table) => ({ ...table, columns: [...table.columns, column] }));
    setNotice('已添加新属性，点击表头即可修改。');
  }

  function updateCell(tableId: string, rowId: string, columnId: string, value: string) {
    updateTable(tableId, (table) => ({
      ...table,
      rows: table.rows.map((row) =>
        row.id === rowId ? { ...row, values: { ...row.values, [columnId]: value } } : row
      )
    }));
  }

  function updateBlankDraft(tableId: string, columnId: string, value: string) {
    setBlankRowDrafts((current) => ({
      ...current,
      [tableId]: { ...current[tableId], [columnId]: value }
    }));
  }

  function commitBlankRow(tableId: string, override?: Record<string, string>) {
    const values = override ?? blankRowDrafts[tableId] ?? {};
    if (!Object.values(values).some((value) => value.trim())) return;
    updateTable(tableId, (table) => ({
      ...table,
      rows: [...table.rows, { id: `row-${crypto.randomUUID()}`, values }]
    }));
    setBlankRowDrafts((current) => ({ ...current, [tableId]: {} }));
    setNotice('新行已自动创建 · 原型数据仅保存在当前页面');
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
              {block.kind === 'text' ? '¶ 文字' : '▧ 图片'}
            </a>
          );
        })}
        <div className="v2-prototype-badge">
          V2 交互原型
          <br />
          <small>不会读写正式数据</small>
        </div>
        <a className="v2-back-link" href="/">
          ← 返回当前正式界面
        </a>
      </aside>

      <main className="v2-page" id="page-top">
        <div className="v2-topline">
          <span>我的项目 / 项目工作台</span>
          <span>仅保存在此页面</span>
        </div>
        <header className="v2-page-header">
          <div className="v2-page-icon">▦</div>
          <h1>项目工作台</h1>
          <p>在一个页面中直接维护不同结构的表格，然后统一生成周报。</p>
        </header>

        <div className="v2-page-actions">
          <button
            className="v2-button v2-button-quiet"
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
                <section className="v2-content-block" id={block.id} key={block.id}>
                  <div className="v2-content-block-toolbar">
                    <span>¶ 文字</span>
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
                    rows={3}
                    value={block.content}
                  />
                </section>
              );
            }
            if (block.kind === 'image') {
              return (
                <section className="v2-content-block" id={block.id} key={block.id}>
                  <div className="v2-content-block-toolbar">
                    <span>▧ 图片</span>
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
                  {block.src ? (
                    <img
                      alt={block.caption || block.fileName || '页面图片'}
                      className="v2-page-image"
                      src={block.src}
                    />
                  ) : (
                    <label className="v2-image-upload">
                      <strong>选择本机图片</strong>
                      <span>PNG、JPEG、WebP 或 GIF，最大 10 MB</span>
                      <input
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(event) => loadImage(block.id, event.target.files?.[0])}
                        type="file"
                      />
                    </label>
                  )}
                  {block.src && (
                    <label className="v2-image-replace">
                      更换图片
                      <input
                        accept="image/png,image/jpeg,image/webp,image/gif"
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
                    value={block.caption}
                  />
                </section>
              );
            }
            const table = visibleTables.find((candidate) => candidate.id === block.tableId);
            if (!table) return null;
            return (
              <section className="v2-table-block" id={table.id} key={block.id}>
                <div className="v2-table-title-row">
                  <div className="v2-table-title">
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
                    包含“
                    {table.filter.keyword}” · 显示 {table.visibleRows.length}/{table.rows.length}
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
                  autoFocus
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
              return (
                <div className="v2-popover-content v2-compact-menu">
                  <div className="v2-popover-title">
                    <span>{block.kind === 'text' ? '¶' : '▧'}</span>
                    <strong>{block.kind === 'text' ? '文字模块' : '图片模块'}</strong>
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
                    <button
                      className="v2-menu-command is-danger"
                      onClick={() => setDestructiveConfirmation('content')}
                      type="button"
                    >
                      <span>⌫</span> 删除模块
                    </button>
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
                      onChange={(event) =>
                        setFilterDraft({ ...filterDraft, columnId: event.target.value })
                      }
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
                  <label>
                    包含文字
                    <input
                      autoFocus
                      placeholder="输入筛选内容"
                      value={filterDraft.keyword}
                      onChange={(event) =>
                        setFilterDraft({ ...filterDraft, keyword: event.target.value })
                      }
                    />
                  </label>
                  <div className="v2-popover-actions">
                    <button
                      onClick={() => {
                        updateTable(table.id, (current) => ({ ...current, filter: undefined }));
                        closePopover();
                      }}
                      type="button"
                    >
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
              <div className="v2-export-hints">
                <span>可编辑 Excel</span>
                <span>展示版 Excel</span>
                <span>Outlook 邮件</span>
              </div>
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
                      placeholder="例如：关键事务跟踪"
                      value={newTableName}
                      onChange={(event) => setNewTableName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') addTable();
                      }}
                    />
                  </label>
                  <div className="v2-template-list">
                    <button onClick={() => setNewTableName('关键事务跟踪')} type="button">
                      <strong>空白表格</strong>
                      <small>名称、状态和自动编号</small>
                    </button>
                    <button onClick={() => setNewTableName('里程碑计划')} type="button">
                      <strong>计划模板</strong>
                      <small>稍后仍可自由修改列</small>
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
    const frame = requestAnimationFrame(updatePosition);
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
              邮件 / 报告
            </button>
            <button
              className={mode === 'excel' ? 'is-active' : ''}
              onClick={() => onModeChange('excel')}
              type="button"
            >
              Excel 自动排版
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
          <div className="v2-report-page">
            <h1>{exportSettings.title || '项目工作台'}</h1>
            {exportSettings.period && <p>{exportSettings.period}</p>}
            {pageBlocks.map((block) => {
              if (block.kind === 'text') {
                if (!exportSettings.includeEmpty && !block.content.trim()) return null;
                return (
                  <section className="v2-static-text-block" key={block.id}>
                    <p>{block.content.trim() || '—'}</p>
                  </section>
                );
              }
              if (block.kind === 'image') {
                if (!block.src && !exportSettings.includeEmpty) return null;
                return (
                  <section className="v2-static-image-block" key={block.id}>
                    {block.src ? (
                      <img alt={block.caption || block.fileName || '页面图片'} src={block.src} />
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
                      table.columns.map((column) => (
                        <span className={reportCellClass(column)} key={`${row.id}-${column.id}`}>
                          {column.type === 'sequence' ? rowIndex + 1 : row.values[column.id] || '—'}
                        </span>
                      ))
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
              : 'Outlook：使用静态表格排版，并保留相同的字段顺序和筛选结果。'}
          </span>
          <button disabled type="button">
            原型仅预览
          </button>
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

function filterRows(table: PrototypeTable) {
  if (!table.filter?.keyword) return table.rows;
  const keyword = table.filter.keyword.toLocaleLowerCase();
  return table.rows.filter((row) =>
    (row.values[table.filter!.columnId] ?? '').toLocaleLowerCase().includes(keyword)
  );
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

function reportCellClass(column: PrototypeColumn) {
  const automaticCenterTypes: PrototypeColumnType[] = ['sequence', 'date', 'person', 'status'];
  const centered =
    column.reportAlign === 'center' ||
    (column.reportAlign !== 'left' && automaticCenterTypes.includes(column.type));
  return [
    column.type === 'status' ? 'is-status' : '',
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
