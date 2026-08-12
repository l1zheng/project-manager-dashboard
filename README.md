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

Version 0.1.0 has completed its Windows x64 portable and per-user installer acceptance matrices. See the user guide for installation, daily operation, backup, restore, upgrade, and recovery instructions.

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

## Windows release

The release artifact must be built on matching Windows hardware because `better-sqlite3` is native. The first x64 build is pinned to Node 24.19.0 and pnpm 11.9.0:

```powershell
powershell.exe -NoLogo -NoProfile -File .\release\build-windows-portable.ps1 -Architecture x64 -ApplicationVersion 0.1.0
```

The resulting ZIP contains its own Node runtime, physical production dependencies, browser/API builds, migrations, optional Outlook bridge, compact release metadata, and a loopback-only Node launcher reached through thin CMD entrypoints. The target PC needs neither Node nor pnpm and can remain offline. The official Node archive is checked once while building; normal startup does not invoke a PowerShell launcher or recalculate a per-file hash manifest. Version 0.1.0 passed the exact extracted-ZIP Windows x64 acceptance gate on 2026-08-11. See the [user guide](docs/USER_GUIDE.md) for normal use and the [Windows verification checklist](docs/WINDOWS_VERIFICATION.md) for release regression testing.

The normal user-facing artifact is built from that same portable directory:

```powershell
$inno = .\release\install-inno-setup.ps1 -InstallDirectory .\artifacts\.tools\inno-setup
.\release\build-windows-installer.ps1 `
  -ReleaseDirectory .\artifacts\ProjectManagerDashboard-0.1.0-win-x64 `
  -ApplicationVersion 0.1.0 `
  -InnoCompiler $inno
```

This produces `ProjectManagerDashboard-Setup-0.1.0-win-x64.exe`. It installs for the current user without administrator rights, adds shortcuts, launches without a console, updates in place, and preserves `%LOCALAPPDATA%\ProjectManagerDashboard` during uninstall. The installed application includes Node.js and SQLite; end users do not install development tools. Local test installers are unsigned and can show “Unknown publisher”; a trusted Authenticode certificate configured through `WINDOWS_SIGNTOOL_COMMAND` signs the launcher, uninstaller, and Setup for formal releases.

Both artifacts can be built on GitHub Actions from `main`. Open the `Windows build` workflow and choose `Run workflow`; the completed Setup EXE and portable ZIP are available together in the run's Artifacts section. The workflow requires both the extracted-ZIP browser journey and installer install/start/in-place-update/restart/uninstall/data-retention gate before upload.

For a durable download link, run the separate `Windows release` workflow. The previously accepted portable-only prerelease is [windows-build-0.1.0-6](https://github.com/l1zheng/project-manager-dashboard/releases/tag/windows-build-0.1.0-6); the next release workflow run publishes both formats.
