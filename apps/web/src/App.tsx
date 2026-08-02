import { useEffect, useState } from 'react';
import type { HealthResponse } from '@project-manager/domain';

type HealthState =
  { kind: 'loading' } | { kind: 'ready'; response: HealthResponse } | { kind: 'error' };

const blocks = [
  { name: '需求跟踪', fields: ['需求号', '需求名称', '当前进展', '交付计划', '责任人', '状态'] },
  { name: '关键事务', fields: ['事项', '进展', '计划闭环时间', '责任人', '状态'] },
  { name: '关键风险', fields: ['风险描述', '影响程度', '风险消减措施', '责任人', '状态'] }
];

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    fetch('/api/health')
      .then(async (response) => {
        if (!response.ok) throw new Error('Health endpoint failed');
        return (await response.json()) as HealthResponse;
      })
      .then((response) => setHealth({ kind: 'ready', response }))
      .catch(() => setHealth({ kind: 'error' }));
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">本地优先 · 单人工作区</p>
          <h1>项目管理工作台</h1>
          <p className="subtitle">Phase 0 工程基础已启动，原型交互将逐步迁移为正式功能。</p>
        </div>
        <div className={`health ${health.kind}`} aria-live="polite">
          <span className="health-dot" />
          {health.kind === 'loading' && '正在连接本地服务'}
          {health.kind === 'ready' && `本地服务正常 · ${health.response.service}`}
          {health.kind === 'error' && '本地服务暂不可用'}
        </div>
      </header>

      <section className="notice">
        <strong>已确认的产品方向</strong>
        <span>多个结构独立的数据库可以在一个看板中展示；筛选和导出将围绕保存视图实现。</span>
      </section>

      <section className="grid" aria-label="已确认的数据库结构">
        {blocks.map((block) => (
          <article className="card" key={block.name}>
            <div className="card-heading">
              <h2>{block.name}</h2>
              <span>独立字段</span>
            </div>
            <ul>
              {block.fields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </main>
  );
}
