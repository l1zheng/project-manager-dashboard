import { openPersistence, type Persistence } from './persistence/database.js';
import * as schema from './persistence/schema.js';

const demoWorkspaceId = 'demo-workspace';
const demoDashboardId = 'demo-dashboard';
const defaultWorkspaceSettingKey = 'default_workspace_id';

export function seedDemoWorkspace(persistence: Persistence): void {
  const now = new Date();
  const seed = persistence.sqlite.transaction(() => {
    persistence.db
      .insert(schema.workspaces)
      .values({
        id: demoWorkspaceId,
        name: '项目管理示例',
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoNothing()
      .run();
    persistence.db
      .insert(schema.appSettings)
      .values({
        key: defaultWorkspaceSettingKey,
        configVersion: 1,
        valueJson: JSON.stringify({ workspaceId: demoWorkspaceId }),
        updatedAt: now
      })
      .onConflictDoNothing()
      .run();
    persistence.db
      .insert(schema.databases)
      .values([
        {
          id: 'demo-requirements',
          workspaceId: demoWorkspaceId,
          name: '需求跟踪',
          description: '面向本周项目需求的跟踪表',
          color: '#5B8FF9',
          sortOrder: 1000,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'demo-risks',
          workspaceId: demoWorkspaceId,
          name: '关键风险',
          description: '需要持续跟踪的交付风险',
          color: '#F4664A',
          sortOrder: 2000,
          createdAt: now,
          updatedAt: now
        }
      ])
      .onConflictDoNothing()
      .run();
    persistence.db
      .insert(schema.fields)
      .values([
        field('req-number', 'demo-requirements', '需求号', 'short_text', 1000),
        field('req-name', 'demo-requirements', '需求名称', 'short_text', 2000),
        field('req-progress', 'demo-requirements', '进展', 'long_text', 3000),
        field('req-plan', 'demo-requirements', '交付计划', 'date', 4000),
        field('req-owner', 'demo-requirements', '责任人', 'person', 5000),
        field('req-status', 'demo-requirements', '状态', 'status', 6000, {
          options: [
            { id: 'not-started', label: '未开始', color: 'gray' },
            { id: 'in-progress', label: '进行中', color: 'blue' },
            { id: 'blocked', label: '受阻', color: 'red' },
            { id: 'closed', label: '已关闭', color: 'green' }
          ],
          completion: { completedOptionIds: ['closed'] }
        }),
        field('risk-description', 'demo-risks', '风险描述', 'long_text', 1000),
        field('risk-mitigation', 'demo-risks', '风险消减措施', 'long_text', 2000),
        field('risk-owner', 'demo-risks', '责任人', 'person', 3000),
        field('risk-status', 'demo-risks', '状态', 'status', 4000, {
          options: [
            { id: 'watching', label: '持续关注', color: 'orange' },
            { id: 'controlled', label: '已受控', color: 'green' },
            { id: 'closed', label: '已关闭', color: 'gray' }
          ],
          completion: { completedOptionIds: ['closed'] }
        })
      ])
      .onConflictDoNothing()
      .run();
    persistence.db
      .insert(schema.records)
      .values([
        {
          id: 'demo-requirement-record',
          databaseId: 'demo-requirements',
          sequenceNumber: 1,
          sortOrder: 1000,
          valuesJson: JSON.stringify({
            'req-number': 'REQ-2026-001',
            'req-name': '支持单点登录',
            'req-progress': '接口设计已评审，等待安全组确认权限范围。',
            'req-plan': '2026-08-14',
            'req-owner': '张三',
            'req-status': 'in-progress'
          }),
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'demo-risk-record',
          databaseId: 'demo-risks',
          sequenceNumber: 1,
          sortOrder: 1000,
          valuesJson: JSON.stringify({
            'risk-description': '外部接口联调环境尚未稳定，可能影响本周验收。',
            'risk-mitigation': '每天同步接口可用性；准备 mock 数据用于前端回归。',
            'risk-owner': '李四',
            'risk-status': 'watching'
          }),
          createdAt: now,
          updatedAt: now
        }
      ])
      .onConflictDoNothing()
      .run();
    persistence.db
      .insert(schema.views)
      .values([
        view('demo-requirements-view', 'demo-requirements', '本周需求', 1000, [
          'req-number',
          'req-name',
          'req-progress',
          'req-plan',
          'req-owner',
          'req-status'
        ]),
        view('demo-risks-view', 'demo-risks', '关键风险', 1000, [
          'risk-description',
          'risk-mitigation',
          'risk-owner',
          'risk-status'
        ])
      ])
      .onConflictDoNothing()
      .run();
    persistence.db
      .insert(schema.dashboards)
      .values({
        id: demoDashboardId,
        workspaceId: demoWorkspaceId,
        name: '项目周报看板',
        sortOrder: 1000,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoNothing()
      .run();
    persistence.db
      .insert(schema.dashboardBlocks)
      .values([
        block('demo-requirements-block', 'demo-requirements-view', 1000),
        block('demo-risks-block', 'demo-risks-view', 2000)
      ])
      .onConflictDoNothing()
      .run();
  });

  seed();

  function field(
    id: string,
    databaseId: string,
    name: string,
    type: (typeof schema.fields.$inferInsert)['type'],
    sortOrder: number,
    config: Record<string, unknown> = {}
  ) {
    return {
      id,
      databaseId,
      name,
      type,
      sortOrder,
      configJson: JSON.stringify({ version: 1, ...config }),
      createdAt: now,
      updatedAt: now
    };
  }

  function view(
    id: string,
    databaseId: string,
    name: string,
    sortOrder: number,
    visibleFieldIds: string[]
  ) {
    return {
      id,
      databaseId,
      name,
      sortOrder,
      configJson: JSON.stringify({ version: 1, visibleFieldIds }),
      createdAt: now,
      updatedAt: now
    };
  }

  function block(id: string, viewId: string, sortOrder: number) {
    return {
      id,
      dashboardId: demoDashboardId,
      kind: 'table_view' as const,
      viewId,
      configJson: JSON.stringify({ version: 1, titleOverride: null, description: null }),
      sortOrder,
      createdAt: now,
      updatedAt: now
    };
  }
}

const persistence = await openPersistence();
try {
  seedDemoWorkspace(persistence);
  console.log('Demo workspace is ready. Existing demo records were left unchanged.');
} finally {
  persistence.close();
}
