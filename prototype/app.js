const fieldTypes = ["自动编号", "单行文本", "多行文本", "日期", "单选", "多选", "状态", "人员", "数字", "复选框", "链接"];

const state = {
  editingDatabaseId: null,
  draggedBlockId: null,
  reportMode: "outlook",
  databases: [
    {
      id: "requirements",
      name: "需求跟踪",
      description: "产品需求、交付计划与当前进展",
      kind: "requirements",
      includeExport: true,
      collapsed: false,
      preset: "all",
      statusFilter: "all",
      ownerFilter: "all",
      fields: [
        { id: "req_seq", name: "序号", type: "自动编号", width: 54 },
        { id: "req_no", name: "需求号", type: "单行文本", width: 92 },
        { id: "req_name", name: "需求名称", type: "单行文本", width: 210 },
        { id: "req_progress", name: "当前进展", type: "多行文本", width: 270 },
        { id: "req_plan", name: "交付计划", type: "日期", width: 105 },
        { id: "req_owner", name: "责任人", type: "人员", width: 90 },
        { id: "req_status", name: "状态", type: "状态", width: 102 },
      ],
      records: [
        { req_seq: 1, req_no: "REQ-241", req_name: "统一身份认证接入", req_progress: "接口联调完成，前端正在处理异常登录提示。", req_plan: "2026-08-07", req_owner: "张晨", req_status: "进行中" },
        { req_seq: 2, req_no: "REQ-246", req_name: "经营报表支持 Excel 导出", req_progress: "字段映射已确认，等待测试环境数据。", req_plan: "2026-08-12", req_owner: "李然", req_status: "等待外部" },
        { req_seq: 3, req_no: "REQ-252", req_name: "审批记录增加操作留痕", req_progress: "已完成技术方案评审，下周进入开发。", req_plan: "2026-08-18", req_owner: "王可", req_status: "未开始" },
        { req_seq: 4, req_no: "REQ-235", req_name: "移动端列表性能优化", req_progress: "灰度验证通过，已完成全量发布。", req_plan: "2026-08-01", req_owner: "张晨", req_status: "已完成" },
      ],
    },
    {
      id: "matters",
      name: "关键事务",
      description: "跨团队协调事项与计划闭环时间",
      kind: "matters",
      includeExport: true,
      collapsed: false,
      preset: "open",
      statusFilter: "all",
      ownerFilter: "all",
      fields: [
        { id: "matter_seq", name: "序号", type: "自动编号", width: 54 },
        { id: "matter_name", name: "事项", type: "单行文本", width: 260 },
        { id: "matter_progress", name: "进展", type: "多行文本", width: 330 },
        { id: "matter_plan", name: "计划闭环时间", type: "日期", width: 130 },
        { id: "matter_owner", name: "责任人", type: "人员", width: 100 },
        { id: "matter_status", name: "状态", type: "状态", width: 105 },
      ],
      records: [
        { matter_seq: 1, matter_name: "确认生产环境网络开通范围", matter_progress: "安全团队已反馈初审意见，仍需补充访问源清单。", matter_plan: "2026-08-05", matter_owner: "赵敏", matter_status: "等待外部" },
        { matter_seq: 2, matter_name: "安排 8 月版本上线窗口", matter_progress: "业务与运维均已确认，拟定周四 20:00 上线。", matter_plan: "2026-08-06", matter_owner: "李然", matter_status: "进行中" },
        { matter_seq: 3, matter_name: "供应商合同补充协议", matter_progress: "采购已完成盖章流程，电子版已归档。", matter_plan: "2026-07-31", matter_owner: "赵敏", matter_status: "已完成" },
      ],
    },
    {
      id: "risks",
      name: "关键风险",
      description: "风险识别、等级判断与消减措施",
      kind: "risks",
      includeExport: true,
      collapsed: false,
      preset: "all",
      statusFilter: "all",
      ownerFilter: "all",
      fields: [
        { id: "risk_seq", name: "序号", type: "自动编号", width: 52 },
        { id: "risk_no", name: "风险编号", type: "单行文本", width: 86 },
        { id: "risk_desc", name: "风险描述", type: "多行文本", width: 225 },
        { id: "risk_level", name: "影响程度", type: "单选", width: 90 },
        { id: "risk_probability", name: "发生概率", type: "单选", width: 88 },
        { id: "risk_mitigation", name: "风险消减措施", type: "多行文本", width: 290 },
        { id: "risk_owner", name: "责任人", type: "人员", width: 88 },
        { id: "risk_status", name: "状态", type: "状态", width: 96 },
      ],
      records: [
        { risk_seq: 1, risk_no: "RSK-018", risk_desc: "测试环境数据脱敏延迟，可能影响本周回归范围。", risk_level: "高", risk_probability: "高", risk_mitigation: "拆分无敏感数据用例先行回归；每日跟踪数据准备进度。", risk_owner: "王可", risk_status: "有风险" },
        { risk_seq: 2, risk_no: "RSK-021", risk_desc: "第三方认证接口存在偶发超时。", risk_level: "中", risk_probability: "中", risk_mitigation: "增加超时重试和熔断策略；上线前完成压力测试。", risk_owner: "张晨", risk_status: "进行中" },
        { risk_seq: 3, risk_no: "RSK-012", risk_desc: "上线窗口与月度结算冲突。", risk_level: "低", risk_probability: "低", risk_mitigation: "已调整上线日期并获得业务确认。", risk_owner: "李然", risk_status: "已完成" },
      ],
    },
  ],
};

const elements = {
  blocks: document.getElementById("dashboard-blocks"),
  databaseNav: document.getElementById("database-nav"),
  databaseDialog: document.getElementById("database-dialog"),
  databaseForm: document.getElementById("database-form"),
  databaseName: document.getElementById("database-name"),
  databaseDialogTitle: document.getElementById("database-dialog-title"),
  databaseDialogEyebrow: document.getElementById("database-dialog-eyebrow"),
  fieldEditor: document.getElementById("field-editor"),
  saveDatabaseButton: document.getElementById("save-database-button"),
  reportDialog: document.getElementById("report-dialog"),
  outlookPreview: document.getElementById("outlook-preview"),
  excelPreview: document.getElementById("excel-preview"),
  outlookTab: document.getElementById("outlook-tab"),
  excelTab: document.getElementById("excel-tab"),
  reportDescription: document.getElementById("report-description"),
  simulateExportButton: document.getElementById("simulate-export-button"),
  toast: document.getElementById("toast"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slug() {
  return `custom-${Date.now().toString(36)}`;
}

function getFieldByType(database, type) {
  return database.fields.find((field) => field.type === type);
}

function getStatusField(database) {
  return database.fields.find((field) => field.type === "状态");
}

function getOwnerField(database) {
  return database.fields.find((field) => field.type === "人员");
}

function statusClass(value) {
  const mapping = {
    "进行中": "in-progress",
    "等待外部": "waiting",
    "有风险": "risk",
    "已完成": "done",
    "未开始": "not-started",
  };
  return mapping[value] || "not-started";
}

function filteredRecords(database) {
  const statusField = getStatusField(database);
  const ownerField = getOwnerField(database);
  return database.records.filter((record) => {
    const status = statusField ? record[statusField.id] : "";
    const owner = ownerField ? record[ownerField.id] : "";
    const presetMatch = database.preset === "all"
      || (database.preset === "open" && status !== "已完成")
      || (database.preset === "attention" && ["有风险", "等待外部"].includes(status));
    const statusMatch = database.statusFilter === "all" || status === database.statusFilter;
    const ownerMatch = database.ownerFilter === "all" || owner === database.ownerFilter;
    return presetMatch && statusMatch && ownerMatch;
  });
}

function uniqueValues(database, field) {
  if (!field) return [];
  return [...new Set(database.records.map((record) => record[field.id]).filter(Boolean))];
}

function cellContent(field, value) {
  if (value === undefined || value === null || value === "") return '<span class="empty-value">—</span>';
  if (field.type === "状态") return `<span class="status-badge ${statusClass(value)}">${escapeHtml(value)}</span>`;
  if (field.name.includes("影响程度")) return `<span class="level-badge ${value === "高" ? "high" : value === "中" ? "medium" : "low"}">${escapeHtml(value)}</span>`;
  return escapeHtml(value);
}

function cellClass(field) {
  if (field.type === "自动编号" || field.type === "数字") return "number-cell";
  if (field.type === "日期") return "date-cell";
  if (field.type === "人员") return "owner-cell";
  return "";
}

function renderSummary() {
  const requirements = state.databases.find((item) => item.kind === "requirements");
  const matters = state.databases.find((item) => item.kind === "matters");
  const risks = state.databases.find((item) => item.kind === "risks");
  document.getElementById("summary-requirements").textContent = requirements
    ? requirements.records.filter((row) => row.req_status === "进行中").length : 0;
  document.getElementById("summary-matters").textContent = matters
    ? matters.records.filter((row) => row.matter_status !== "已完成").length : 0;
  document.getElementById("summary-risks").textContent = risks
    ? risks.records.filter((row) => row.risk_level === "高" && row.risk_status !== "已完成").length : 0;
}

function renderNav() {
  elements.databaseNav.innerHTML = state.databases.map((database) => `
    <button class="database-nav-item" type="button" data-scroll-database="${database.id}">
      <span class="database-icon ${database.kind || "custom"}" aria-hidden="true"></span>
      <span>${escapeHtml(database.name)}</span>
      <span class="database-count">${database.records.length}</span>
    </button>
  `).join("");
}

function renderBlock(database) {
  const records = filteredRecords(database);
  const statusField = getStatusField(database);
  const ownerField = getOwnerField(database);
  const statusOptions = uniqueValues(database, statusField);
  const ownerOptions = uniqueValues(database, ownerField);
  const activeFilters = [database.statusFilter !== "all", database.ownerFilter !== "all", database.preset !== "all"].filter(Boolean).length;

  const headerCells = database.fields.map((field) => `
    <th style="width:${field.width || 130}px">${escapeHtml(field.name)}</th>
  `).join("");

  const rows = records.map((record) => `
    <tr>${database.fields.map((field) => `<td class="${cellClass(field)}">${cellContent(field, record[field.id])}</td>`).join("")}</tr>
  `).join("");

  return `
    <article class="database-block ${database.collapsed ? "collapsed" : ""}" id="block-${database.id}" data-database-id="${database.id}" draggable="true">
      <div class="block-header">
        <div class="block-title-area">
          <span class="drag-handle" title="拖动排序" aria-hidden="true">⠿</span>
          <span class="database-icon ${database.kind || "custom"}" aria-hidden="true"></span>
          <div class="block-title-copy">
            <h3>${escapeHtml(database.name)} <span class="record-count">${records.length} / ${database.records.length} 条</span></h3>
            <p>${escapeHtml(database.description || "自定义数据库视图")}</p>
          </div>
        </div>
        <div class="block-actions">
          <label class="export-check"><input type="checkbox" data-export-toggle="${database.id}" ${database.includeExport ? "checked" : ""}> 加入周报</label>
          <button class="button tertiary small" type="button" data-edit-database="${database.id}">字段</button>
          <button class="icon-button" type="button" data-collapse="${database.id}" aria-label="${database.collapsed ? "展开" : "折叠"}${escapeHtml(database.name)}">${database.collapsed ? "＋" : "—"}</button>
        </div>
      </div>
      <div class="view-toolbar">
        <div class="view-toolbar-left">
          <select class="view-tab" data-preset="${database.id}" aria-label="${escapeHtml(database.name)}视图">
            <option value="all" ${database.preset === "all" ? "selected" : ""}>全部记录</option>
            <option value="open" ${database.preset === "open" ? "selected" : ""}>未完成</option>
            <option value="attention" ${database.preset === "attention" ? "selected" : ""}>需关注</option>
          </select>
          ${activeFilters ? `<span class="filter-indicator">${activeFilters} 个条件</span>` : ""}
        </div>
        <div class="view-toolbar-right">
          ${statusField ? `<select class="select-control" data-status-filter="${database.id}" aria-label="按状态筛选">
            <option value="all">状态：全部</option>
            ${statusOptions.map((value) => `<option value="${escapeHtml(value)}" ${database.statusFilter === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
          </select>` : ""}
          ${ownerField ? `<select class="select-control" data-owner-filter="${database.id}" aria-label="按责任人筛选">
            <option value="all">责任人：全部</option>
            ${ownerOptions.map((value) => `<option value="${escapeHtml(value)}" ${database.ownerFilter === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
          </select>` : ""}
        </div>
      </div>
      ${database.fields.length && records.length ? `<div class="table-wrap">
        <table class="data-table">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : `<div class="empty-state"><strong>${database.fields.length ? "当前筛选没有记录" : "还没有字段"}</strong><span>${database.fields.length ? "调整筛选条件查看其他记录" : "点击“字段”定义这个数据库的结构"}</span></div>`}
      <button class="add-row-button" type="button" data-add-record="${database.id}">＋ 新建一条记录</button>
    </article>
  `;
}

function renderDashboard() {
  elements.blocks.innerHTML = state.databases.map(renderBlock).join("");
  renderNav();
  renderSummary();
  bindDashboardEvents();
}

function bindDashboardEvents() {
  document.querySelectorAll("[data-scroll-database]").forEach((button) => {
    button.addEventListener("click", () => document.getElementById(`block-${button.dataset.scrollDatabase}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  });
  document.querySelectorAll("[data-collapse]").forEach((button) => button.addEventListener("click", () => {
    const database = state.databases.find((item) => item.id === button.dataset.collapse);
    database.collapsed = !database.collapsed;
    renderDashboard();
  }));
  document.querySelectorAll("[data-export-toggle]").forEach((input) => input.addEventListener("change", () => {
    const database = state.databases.find((item) => item.id === input.dataset.exportToggle);
    database.includeExport = input.checked;
    showToast(input.checked ? `${database.name} 已加入周报` : `${database.name} 已从周报中排除`);
  }));
  document.querySelectorAll("[data-preset]").forEach((select) => select.addEventListener("change", () => {
    state.databases.find((item) => item.id === select.dataset.preset).preset = select.value;
    renderDashboard();
  }));
  document.querySelectorAll("[data-status-filter]").forEach((select) => select.addEventListener("change", () => {
    state.databases.find((item) => item.id === select.dataset.statusFilter).statusFilter = select.value;
    renderDashboard();
  }));
  document.querySelectorAll("[data-owner-filter]").forEach((select) => select.addEventListener("change", () => {
    state.databases.find((item) => item.id === select.dataset.ownerFilter).ownerFilter = select.value;
    renderDashboard();
  }));
  document.querySelectorAll("[data-edit-database]").forEach((button) => button.addEventListener("click", () => openDatabaseDialog(button.dataset.editDatabase)));
  document.querySelectorAll("[data-add-record]").forEach((button) => button.addEventListener("click", () => addMockRecord(button.dataset.addRecord)));

  document.querySelectorAll(".database-block").forEach((block) => {
    block.addEventListener("dragstart", () => {
      state.draggedBlockId = block.dataset.databaseId;
      block.classList.add("is-dragging");
    });
    block.addEventListener("dragend", () => {
      state.draggedBlockId = null;
      document.querySelectorAll(".database-block").forEach((item) => item.classList.remove("is-dragging", "drag-target"));
    });
    block.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (block.dataset.databaseId !== state.draggedBlockId) block.classList.add("drag-target");
    });
    block.addEventListener("dragleave", () => block.classList.remove("drag-target"));
    block.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetId = block.dataset.databaseId;
      if (!state.draggedBlockId || targetId === state.draggedBlockId) return;
      const from = state.databases.findIndex((item) => item.id === state.draggedBlockId);
      const to = state.databases.findIndex((item) => item.id === targetId);
      const [moved] = state.databases.splice(from, 1);
      state.databases.splice(to, 0, moved);
      renderDashboard();
      showToast("看板区块顺序已调整");
    });
  });
}

function addMockRecord(databaseId) {
  const database = state.databases.find((item) => item.id === databaseId);
  const record = {};
  database.fields.forEach((field) => {
    if (field.type === "自动编号") record[field.id] = database.records.length + 1;
    else if (field.type === "状态") record[field.id] = "未开始";
    else if (field.type === "人员") record[field.id] = "待分配";
    else record[field.id] = "";
  });
  database.records.push(record);
  renderDashboard();
  showToast(`已在“${database.name}”中新增演示记录`);
}

function fieldRow(field = { id: slug(), name: "", type: "单行文本", width: 130 }) {
  const row = document.createElement("div");
  row.className = "field-row";
  row.dataset.fieldId = field.id;
  row.innerHTML = `
    <span class="field-grip" aria-hidden="true">⠿</span>
    <input class="field-name-input" value="${escapeHtml(field.name)}" placeholder="字段名称" aria-label="字段名称">
    <select class="field-type-select" aria-label="字段类型">${fieldTypes.map((type) => `<option value="${type}" ${type === field.type ? "selected" : ""}>${type}</option>`).join("")}</select>
    <button class="icon-button remove-field" type="button" aria-label="删除字段">×</button>
  `;
  row.querySelector(".remove-field").addEventListener("click", () => row.remove());
  return row;
}

function openDatabaseDialog(databaseId = null) {
  state.editingDatabaseId = databaseId;
  const database = state.databases.find((item) => item.id === databaseId);
  elements.databaseName.value = database?.name || "";
  elements.databaseDialogTitle.textContent = database ? `设置：${database.name}` : "新建数据库";
  elements.databaseDialogEyebrow.textContent = database ? "独立数据库结构" : "自定义结构";
  elements.saveDatabaseButton.textContent = database ? "保存字段设置" : "创建并加入看板";
  elements.fieldEditor.innerHTML = "";
  const fields = database?.fields || [
    { id: slug(), name: "序号", type: "自动编号", width: 54 },
    { id: slug(), name: "事项", type: "单行文本", width: 220 },
    { id: slug(), name: "进展", type: "多行文本", width: 260 },
    { id: slug(), name: "责任人", type: "人员", width: 90 },
    { id: slug(), name: "状态", type: "状态", width: 100 },
  ];
  fields.forEach((field) => elements.fieldEditor.append(fieldRow(field)));
  elements.databaseDialog.showModal();
  requestAnimationFrame(() => elements.databaseName.focus());
}

function saveDatabase(event) {
  event.preventDefault();
  const name = elements.databaseName.value.trim();
  const rows = [...elements.fieldEditor.querySelectorAll(".field-row")];
  const fields = rows.map((row) => ({
    id: row.dataset.fieldId,
    name: row.querySelector(".field-name-input").value.trim(),
    type: row.querySelector(".field-type-select").value,
    width: row.querySelector(".field-type-select").value === "多行文本" ? 250 : 120,
  })).filter((field) => field.name);

  if (!name) {
    elements.databaseName.focus();
    return;
  }
  if (!fields.length) {
    showToast("请至少添加一个字段");
    return;
  }

  if (state.editingDatabaseId) {
    const database = state.databases.find((item) => item.id === state.editingDatabaseId);
    database.name = name;
    database.fields = fields;
    showToast(`“${name}”的字段已更新`);
  } else {
    state.databases.push({
      id: slug(),
      name,
      description: "刚刚创建的自定义数据库",
      kind: "custom",
      includeExport: true,
      collapsed: false,
      preset: "all",
      statusFilter: "all",
      ownerFilter: "all",
      fields,
      records: [],
    });
    showToast(`“${name}”已创建并加入看板`);
  }
  elements.databaseDialog.close();
  renderDashboard();
}

function reportDatabases() {
  return state.databases.filter((database) => database.includeExport);
}

function reportFields(database) {
  return database.fields;
}

function renderOutlookPreview() {
  const sections = reportDatabases().map((database) => {
    const fields = reportFields(database);
    const rows = filteredRecords(database);
    return `
      <section class="email-section">
        <div class="email-section-title">${escapeHtml(database.name)}（${rows.length}）</div>
        <table class="email-table" role="presentation">
          <thead><tr>${fields.map((field) => `<th>${escapeHtml(field.name)}</th>`).join("")}</tr></thead>
          <tbody>${rows.length ? rows.map((record) => `<tr>${fields.map((field) => `<td>${escapeHtml(record[field.id] || "—")}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${fields.length}">当前视图没有需要汇报的记录</td></tr>`}</tbody>
        </table>
      </section>
    `;
  }).join("");

  elements.outlookPreview.innerHTML = `
    <div class="email-subject"><span>主题</span><strong>【项目周报】研发交付项目组 · 2026 年第 31 周</strong></div>
    <p class="email-intro">各位好，以下为本周项目重点进展、关键事务及风险情况，请查阅。</p>
    ${sections || '<p class="email-intro">尚未选择需要加入周报的数据库。</p>'}
    <p class="email-footer">本邮件由项目管理工作台生成。发送前可在经典 Outlook 中继续编辑。</p>
  `;
}

function preferredWeight(field) {
  const weights = { "自动编号": 4, "数字": 5, "日期": 7, "人员": 6, "状态": 7, "单选": 6, "多选": 9, "多行文本": 16, "单行文本": 11, "复选框": 4, "链接": 10 };
  return weights[field.type] || 9;
}

function calculateSpans(fields, total = 60) {
  const weights = fields.map(preferredWeight);
  const sum = weights.reduce((acc, value) => acc + value, 0);
  const raw = weights.map((value) => (value / sum) * total);
  const spans = raw.map((value) => Math.max(2, Math.floor(value)));
  let current = spans.reduce((acc, value) => acc + value, 0);
  const order = raw.map((value, index) => ({ index, remainder: value - Math.floor(value) })).sort((a, b) => b.remainder - a.remainder);
  let cursor = 0;
  while (current < total) {
    spans[order[cursor % order.length].index] += 1;
    current += 1;
    cursor += 1;
  }
  while (current > total) {
    const candidate = spans.findIndex((value) => value > 2);
    if (candidate < 0) break;
    spans[candidate] -= 1;
    current -= 1;
  }
  return spans;
}

function excelRow(fields, spans, record, isHeader = false) {
  return fields.map((field, index) => `<div class="excel-cell ${isHeader ? "header" : ""}" style="grid-column: span ${spans[index]}">${escapeHtml(isHeader ? field.name : (record?.[field.id] || "—"))}</div>`).join("");
}

function renderExcelPreview() {
  const sections = reportDatabases().map((database) => {
    const fields = reportFields(database);
    const spans = calculateSpans(fields);
    const rows = filteredRecords(database).slice(0, 3);
    return `
      <section class="excel-section">
        <div class="excel-section-title">${escapeHtml(database.name)}</div>
        <div class="excel-grid">${excelRow(fields, spans, null, true)}</div>
        ${rows.map((record) => `<div class="excel-grid">${excelRow(fields, spans, record)}</div>`).join("")}
      </section>
    `;
  }).join("");
  elements.excelPreview.innerHTML = `
    <div class="excel-sheet-tabs"><span class="excel-sheet-tab">项目周报（汇报版）</span></div>
    <div class="excel-title">研发交付项目组 · 2026 年第 31 周项目周报</div>
    ${sections || '<p>尚未选择需要导出的数据库。</p>'}
    <p class="excel-layout-note">演示：每个模块独立计算字段跨度，并映射到同一套 60 列基础网格。</p>
  `;
}

function openReport(mode) {
  state.reportMode = mode;
  renderOutlookPreview();
  renderExcelPreview();
  switchReportMode(mode);
  elements.reportDialog.showModal();
}

function switchReportMode(mode) {
  state.reportMode = mode;
  const outlook = mode === "outlook";
  elements.outlookTab.classList.toggle("is-active", outlook);
  elements.excelTab.classList.toggle("is-active", !outlook);
  elements.outlookTab.setAttribute("aria-selected", String(outlook));
  elements.excelTab.setAttribute("aria-selected", String(!outlook));
  elements.outlookPreview.hidden = !outlook;
  elements.excelPreview.hidden = outlook;
  elements.reportDescription.textContent = outlook
    ? "已移除筛选和编辑控件，采用经典 Outlook 兼容排版。"
    : "各模块根据内容自动分配 60 列基础网格并合并单元格。";
  elements.simulateExportButton.textContent = outlook ? "创建 Outlook 草稿" : "生成汇报版 Excel";
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2300);
}

document.getElementById("new-database-side").addEventListener("click", () => openDatabaseDialog());
document.getElementById("new-database-top").addEventListener("click", () => openDatabaseDialog());
document.getElementById("add-field-button").addEventListener("click", () => elements.fieldEditor.append(fieldRow()));
elements.databaseForm.addEventListener("submit", saveDatabase);
document.getElementById("outlook-preview-button").addEventListener("click", () => openReport("outlook"));
document.getElementById("excel-preview-button").addEventListener("click", () => openReport("excel"));
document.getElementById("weekly-report-nav").addEventListener("click", () => openReport("outlook"));
document.getElementById("close-report-button").addEventListener("click", () => elements.reportDialog.close());
elements.outlookTab.addEventListener("click", () => switchReportMode("outlook"));
elements.excelTab.addEventListener("click", () => switchReportMode("excel"));
elements.simulateExportButton.addEventListener("click", () => showToast(state.reportMode === "outlook" ? "正式版将在经典 Outlook 中打开草稿" : "正式版将生成可下载的 .xlsx 文件"));

renderDashboard();
