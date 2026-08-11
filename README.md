# Project Manager Dashboard

A local-first, single-user project-management workspace with independent custom databases, multiple saved table views on one dashboard, and report-quality exports to Excel and Windows classic Outlook.

## Project documents

- [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Current project status](docs/PROJECT_STATUS.md)
- [0.1.0 用户手册](docs/USER_GUIDE.md)
- [0.1.0 发布说明](docs/RELEASE_NOTES_0.1.0.md)
- [Windows verification checklist](docs/WINDOWS_VERIFICATION.md)
- [Model routing agreement](docs/MODEL_ROUTING.md)
- [Agent working agreement](AGENTS.md)
- [Interactive prototype](prototype/README.md)

Version 0.1.0 has completed its Windows x64 acceptance matrix. It is the first local, single-user portable release; see the user guide for installation, daily operation, backup, restore, upgrade, and recovery instructions.

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

The resulting ZIP contains its own Node runtime, physical production dependencies, browser/API builds, migrations, optional Outlook bridge, compact release metadata, and a loopback-only Node launcher reached through thin CMD entrypoints. The target PC needs neither Node nor pnpm and can remain offline. The official Node archive is checked once while building; normal startup does not invoke a PowerShell launcher or recalculate a per-file hash manifest. Version 0.1.0 passed the exact extracted-ZIP Windows x64 acceptance gate on 2026-08-11. See the [user guide](docs/USER_GUIDE.md) for normal use and the [Windows verification checklist](docs/WINDOWS_VERIFICATION.md) for release regression testing.

The same portable ZIP can be built on GitHub Actions from the repository's `main` branch. Open the `Windows portable build` workflow and choose `Run workflow`; the completed ZIP is available from the workflow run's Artifacts section. The workflow uses the repository's pinned Node.js and pnpm versions, then extracts the real ZIP and requires packaged SQLite, CMD launch, Microsoft Edge interaction, stop/restart persistence, mixed modules, saved filters, Excel exports, Outlook HTML, and backup to pass before upload.

For a durable download link, run the separate `Windows portable release` workflow. The accepted public prerelease is [windows-build-0.1.0-6](https://github.com/l1zheng/project-manager-dashboard/releases/tag/windows-build-0.1.0-6).
