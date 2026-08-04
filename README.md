# Project Manager Dashboard

A local-first, single-user project-management workspace with independent custom databases, multiple saved table views on one dashboard, and report-quality exports to Excel and Windows classic Outlook.

## Project documents

- [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Current project status](docs/PROJECT_STATUS.md)
- [Windows verification checklist](docs/WINDOWS_VERIFICATION.md)
- [Model routing agreement](docs/MODEL_ROUTING.md)
- [Agent working agreement](AGENTS.md)
- [Interactive prototype](prototype/README.md)

The Phase 0A prototype is accepted. The repository now includes the production TypeScript foundation, local SQLite persistence, and the first version-controlled migration.

## Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
```

The web app runs on `http://127.0.0.1:5173/` and proxies `/api` to the local Fastify service on `http://127.0.0.1:4300/`.

The API creates its local workspace database under the platform application-data directory by default. Set `PM_DATA_DIR` to an isolated directory for development or diagnostics. To create the non-destructive demo workspace, run:

```bash
pnpm --filter @project-manager/api seed:demo
```

## Windows portable release

The release artifact must be built on matching Windows hardware because `better-sqlite3` is native. The first x64 build is pinned to Node 24.19.0 and pnpm 11.9.0:

```powershell
powershell.exe -NoLogo -NoProfile -File .\release\build-windows-portable.ps1 -Architecture x64 -ApplicationVersion 0.1.0
```

The resulting ZIP contains its own Node runtime, physical production dependencies, browser/API builds, migrations, Outlook bridge, loopback launcher, and an exact SHA-256 file manifest. The target PC needs neither Node nor pnpm and can remain offline. See [the Windows verification checklist](docs/WINDOWS_VERIFICATION.md) before treating the artifact as production-ready.
