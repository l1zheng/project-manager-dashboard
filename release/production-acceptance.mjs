import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const options = parseArguments(process.argv.slice(2));
await mkdir(options.outputDirectory, { recursive: true });

if (options.phase === 'setup') await setupJourney();
else if (options.phase === 'verify') await verifyJourney();
else throw new Error(`Unsupported phase: ${options.phase}`);

async function setupJourney() {
  await checkRuntimeAndWeb();
  const initial = await requestJson('/api/workspace/primary-dashboard', { method: 'POST' });
  assert.equal(initial.blocks.length, 0, 'Acceptance data directory must start empty.');

  const requirementBlock = await requestJson('/api/workspace/tables', {
    method: 'POST',
    body: { name: '验收需求跟踪' },
    expectedStatus: 201
  });
  const riskBlock = await requestJson('/api/workspace/tables', {
    method: 'POST',
    body: { name: '验收关键风险' },
    expectedStatus: 201
  });
  assert.equal(requirementBlock.kind, 'table_view');
  assert.equal(riskBlock.kind, 'table_view');

  const requirement = requirementBlock.view;
  const risk = riskBlock.view;
  const requirementDefaults = fieldsByName(requirement.fields);
  const riskDefaults = fieldsByName(risk.fields);

  await patch(`/api/fields/${requirementDefaults.get('名称').id}`, {
    name: '需求描述'
  });
  await patch(`/api/fields/${riskDefaults.get('名称').id}`, { name: '风险描述' });

  const requirementNumber = await createField(requirement.database.id, {
    name: '需求号',
    type: 'short_text'
  });
  const requirementProgress = await createField(requirement.database.id, {
    name: '当前进展',
    type: 'long_text'
  });
  const requirementPlan = await createField(requirement.database.id, {
    name: '交付计划',
    type: 'date'
  });
  const requirementOwner = await createField(requirement.database.id, {
    name: '责任人',
    type: 'person'
  });
  const requirementEffort = await createField(requirement.database.id, {
    name: '工作量',
    type: 'number'
  });
  const requirementStatus = await configureStatus(
    requirementDefaults.get('状态'),
    ['Open', 'Suspended', 'Closed'],
    2
  );
  const requirementFields = [
    requirementDefaults.get('序号'),
    requirementNumber,
    requirementDefaults.get('名称'),
    requirementProgress,
    requirementPlan,
    requirementOwner,
    requirementEffort,
    requirementStatus.field
  ];
  await updateView(requirement.view.id, requirementFields, {
    fieldPresentation: {
      [requirementNumber.id]: { reportAlign: 'center' },
      [requirementDefaults.get('名称').id]: { reportEmphasis: 'strong' }
    }
  });

  const riskMitigation = await createField(risk.database.id, {
    name: '风险消减措施',
    type: 'long_text'
  });
  const riskOwner = await createField(risk.database.id, { name: '责任人', type: 'person' });
  const riskPlan = await createField(risk.database.id, { name: '计划闭环时间', type: 'date' });
  const riskStatus = await configureStatus(
    riskDefaults.get('状态'),
    ['Open', 'Suspended', 'Closed'],
    2
  );
  const riskFields = [
    riskDefaults.get('序号'),
    riskDefaults.get('名称'),
    riskMitigation,
    riskPlan,
    riskOwner,
    riskStatus.field
  ];
  await updateView(risk.view.id, riskFields);

  const openRequirement = await createRecord(requirement.database.id, {
    [requirementNumber.id]: 'REQ-001',
    [requirementDefaults.get('名称').id]: 'Windows 成品完整验收',
    [requirementProgress.id]: '启动、持久化、混合模块和 Excel 已进入自动验收。',
    [requirementPlan.id]: '2026-08-15',
    [requirementOwner.id]: '李正',
    [requirementEffort.id]: 3.5,
    [requirementStatus.field.id]: requirementStatus.optionIds[0]
  });
  const closedRequirement = await createRecord(requirement.database.id, {
    [requirementNumber.id]: 'REQ-000',
    [requirementDefaults.get('名称').id]: '旧启动器替换',
    [requirementProgress.id]: '已完成。',
    [requirementPlan.id]: '2026-08-10',
    [requirementOwner.id]: '李正',
    [requirementEffort.id]: 2,
    [requirementStatus.field.id]: requirementStatus.optionIds[2]
  });
  const riskRecord = await createRecord(risk.database.id, {
    [riskDefaults.get('名称').id]: '企业策略拦截 PowerShell',
    [riskMitigation.id]: '成品启动不再依赖 PowerShell；构建和业务验收全部在 Windows runner 执行。',
    [riskPlan.id]: '2026-08-15',
    [riskOwner.id]: '李正',
    [riskStatus.field.id]: riskStatus.optionIds[0]
  });

  const duplicateRecord = await requestJson(`/api/records/${openRequirement.id}/duplicate`, {
    method: 'POST',
    expectedStatus: 201
  });
  await requestJson(`/api/records/${duplicateRecord.id}/archive`, { method: 'POST' });
  const duplicateTable = await requestJson(
    `/api/dashboard-blocks/${requirementBlock.id}/duplicate-table`,
    { method: 'POST', expectedStatus: 201 }
  );
  await requestJson(`/api/dashboard-blocks/${duplicateTable.id}/archive`, { method: 'POST' });

  await requestJson(`/api/fields/${requirementEffort.id}/archive`, { method: 'POST' });
  const repairedAfterArchive = await requestJson(
    `/api/dashboards/${initial.dashboard.id || requirementBlock.dashboardId}`
  );
  const repairedRequirement = repairedAfterArchive.blocks.find(
    (block) => block.id === requirementBlock.id
  );
  assert.ok(repairedRequirement);
  assert.ok(!repairedRequirement.view.view.config.visibleFieldIds.includes(requirementEffort.id));

  const textBlock = await requestJson('/api/workspace/content-blocks', {
    method: 'POST',
    expectedStatus: 201,
    body: {
      kind: 'text',
      config: { version: 1, title: '验收摘要', body: '同一页面保留不同结构的表格、文字和图片。' }
    }
  });
  const imageBlock = await requestJson('/api/workspace/content-blocks', {
    method: 'POST',
    expectedStatus: 201,
    body: {
      kind: 'image',
      config: { version: 1, title: '验收图片', caption: '由生产接口写入 SQLite。' }
    }
  });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9xkAAAAASUVORK5CYII=',
    'base64'
  );
  const uploaded = await requestJson(`/api/dashboard-blocks/${imageBlock.id}/image`, {
    method: 'PUT',
    expectedStatus: 200,
    headers: {
      'content-type': 'image/png',
      'x-project-manager-filename': encodeURIComponent('验收图片.png')
    },
    rawBody: png
  });
  assert.equal(uploaded.asset.byteLength, png.length);

  const dashboard = await requestJson('/api/workspace/primary-dashboard', { method: 'POST' });
  const canonicalOrder = [requirementBlock.id, riskBlock.id, textBlock.id, imageBlock.id];
  await requestJson(`/api/dashboards/${dashboard.dashboard.id}/block-order`, {
    method: 'PUT',
    body: { blockIds: [imageBlock.id, ...canonicalOrder.slice(0, 3)] }
  });
  const reordered = await requestJson(`/api/dashboards/${dashboard.dashboard.id}/block-order`, {
    method: 'PUT',
    body: { blockIds: canonicalOrder }
  });
  assert.deepEqual(
    reordered.blocks.map((block) => block.id),
    canonicalOrder
  );

  await updateView(
    requirement.view.id,
    requirementFields.filter((field) => field.id !== requirementEffort.id),
    {
      filter: {
        kind: 'condition',
        fieldId: requirementStatus.field.id,
        operator: 'equals',
        value: requirementStatus.optionIds[0]
      },
      fieldPresentation: {
        [requirementNumber.id]: { reportAlign: 'center' },
        [requirementDefaults.get('名称').id]: { reportEmphasis: 'strong' }
      }
    }
  );
  await updateView(risk.view.id, riskFields, {
    filter: {
      kind: 'condition',
      fieldId: riskDefaults.get('名称').id,
      operator: 'contains',
      value: 'PowerShell'
    }
  });

  const scenario = {
    dashboardId: dashboard.dashboard.id,
    requirement: {
      blockId: requirementBlock.id,
      databaseId: requirement.database.id,
      viewId: requirement.view.id,
      openRecordId: openRequirement.id,
      closedRecordId: closedRequirement.id,
      statusFieldId: requirementStatus.field.id
    },
    risk: {
      blockId: riskBlock.id,
      databaseId: risk.database.id,
      viewId: risk.view.id,
      recordId: riskRecord.id
    },
    textBlockId: textBlock.id,
    imageBlockId: imageBlock.id,
    imageAssetUrl: uploaded.asset.contentUrl,
    canonicalOrder
  };
  await writeFile(
    resolve(options.outputDirectory, 'scenario.json'),
    `${JSON.stringify(scenario, null, 2)}\n`,
    'utf8'
  );
  await verifyState(scenario, 'setup');
  console.log('Production acceptance setup phase passed.');
}

async function verifyJourney() {
  await checkRuntimeAndWeb();
  const scenario = JSON.parse(
    await readFile(resolve(options.outputDirectory, 'scenario.json'), 'utf8')
  );
  await verifyState(scenario, 'restart');
  console.log('Production acceptance restart phase passed.');
}

async function verifyState(scenario, label) {
  const dashboard = await requestJson(`/api/dashboards/${scenario.dashboardId}`);
  assert.deepEqual(
    dashboard.blocks.map((block) => block.id),
    scenario.canonicalOrder,
    'Mixed module order must survive.'
  );
  assert.deepEqual(
    dashboard.blocks.map((block) => block.kind),
    ['table_view', 'table_view', 'text', 'image']
  );
  assert.equal(dashboard.blocks[0].view.database.name, '验收需求跟踪');
  assert.equal(dashboard.blocks[1].view.database.name, '验收关键风险');
  assert.equal(dashboard.blocks[0].view.records.length, 1, 'Status filter must remain active.');
  assert.equal(dashboard.blocks[1].view.records.length, 1, 'Text filter must remain active.');
  assert.equal(dashboard.blocks[2].config.title, '验收摘要');
  assert.equal(dashboard.blocks[3].config.title, '验收图片');
  assert.ok(dashboard.blocks[3].asset);

  const imageResponse = await fetch(new URL(scenario.imageAssetUrl, options.baseUrl));
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get('content-type'), 'image/png');
  assert.ok((await imageResponse.arrayBuffer()).byteLength > 0);

  const report = await requestJson(
    `/api/dashboards/${scenario.dashboardId}/report-preview?title=${encodeURIComponent('Windows 成品验收')}&includeEmptySections=true&includeCompleted=true`
  );
  assert.deepEqual(
    report.model.blocks.map((block) => block.kind),
    ['table', 'table', 'text', 'image']
  );
  assert.ok(report.html.includes('Windows 成品完整验收'));
  assert.ok(report.html.includes('风险消减措施'));
  assert.ok(report.html.includes('验收摘要'));
  assert.ok(!report.html.includes('旧启动器替换'), 'Saved status filter must apply to exports.');

  await download(
    `/api/dashboards/${scenario.dashboardId}/export/editable.xlsx?includeEmptySections=true`,
    `acceptance-${label}-editable.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  await download(
    `/api/dashboards/${scenario.dashboardId}/export/presentation.xlsx?includeEmptySections=true`,
    `acceptance-${label}-presentation.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  await download('/api/workspace/backup', `acceptance-${label}.pmdbackup`, 'application/zip');
}

async function checkRuntimeAndWeb() {
  const health = await requestJson('/api/health');
  assert.equal(health.status, 'ok');
  assert.equal(health.service, 'project-manager-api');
  assert.equal(health.storage.engine, 'sqlite');
  assert.equal(health.storage.migration.pendingCount, 0);
  const page = await fetch(new URL('/', options.baseUrl));
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('<div id="root"></div>'));
}

async function configureStatus(field, labels, completedIndex) {
  const existing = field.config.options;
  assert.ok(existing?.length >= labels.length);
  const options = labels.map((label, index) => ({ id: existing[index].id, label }));
  const updated = await patch(`/api/fields/${field.id}`, {
    type: 'status',
    config: {
      version: 1,
      options,
      completion: { completedOptionIds: [options[completedIndex].id] }
    }
  });
  return { field: updated, optionIds: options.map((option) => option.id) };
}

async function createField(databaseId, field) {
  return requestJson(`/api/databases/${databaseId}/fields`, {
    method: 'POST',
    expectedStatus: 201,
    body: { ...field, config: field.config ?? { version: 1 } }
  });
}

async function createRecord(databaseId, values) {
  return requestJson(`/api/databases/${databaseId}/records`, {
    method: 'POST',
    expectedStatus: 201,
    body: { values }
  });
}

async function updateView(viewId, fields, overrides = {}) {
  return patch(`/api/views/${viewId}`, {
    config: {
      version: 1,
      visibleFieldIds: fields.map((field) => field.id),
      fieldWidths: Object.fromEntries(
        fields.map((field) => [
          field.id,
          field.type === 'sequence' ? 76 : field.type === 'status' ? 132 : 220
        ])
      ),
      fieldPresentation: overrides.fieldPresentation ?? {},
      filter: overrides.filter ?? null,
      sorts: [],
      includeArchived: false
    }
  });
}

function fieldsByName(fields) {
  return new Map(fields.map((field) => [field.name, field]));
}

async function patch(path, body) {
  return requestJson(path, { method: 'PATCH', body });
}

async function requestJson(path, init = {}) {
  const response = await fetch(new URL(path, options.baseUrl), {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers
    },
    body: init.rawBody ?? (init.body ? JSON.stringify(init.body) : undefined)
  });
  const expectedStatus = init.expectedStatus ?? 200;
  if (response.status !== expectedStatus) {
    throw new Error(
      `${init.method ?? 'GET'} ${path} returned ${response.status}: ${await response.text()}`
    );
  }
  return response.json();
}

async function download(path, filename, expectedType) {
  const response = await fetch(new URL(path, options.baseUrl));
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${path}`);
  assert.ok(response.headers.get('content-type')?.includes(expectedType));
  const content = Buffer.from(await response.arrayBuffer());
  assert.ok(content.length > 100, `${filename} is unexpectedly small.`);
  if (filename.endsWith('.xlsx') || filename.endsWith('.pmdbackup')) {
    assert.equal(content.subarray(0, 2).toString(), 'PK');
  }
  await writeFile(resolve(options.outputDirectory, filename), content);
  return content;
}

function parseArguments(argumentsList) {
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    values.set(argumentsList[index], argumentsList[index + 1]);
  }
  return {
    baseUrl: values.get('--base-url') ?? 'http://127.0.0.1:4300',
    phase: values.get('--phase') ?? 'setup',
    outputDirectory: resolve(values.get('--output-dir') ?? 'artifacts/acceptance')
  };
}
