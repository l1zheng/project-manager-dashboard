# Windows verification checklist

Run this checklist on the Windows PC intended to build and use the first release. It validates both the source build and the self-contained portable artifact before Outlook integration is accepted.

Status for 0.1.0: accepted on 2026-08-09. The Windows x64 build and native SQLite checks were recorded in commit `fd1901b`; the user subsequently confirmed the remaining offline launch, persistence, start/stop, tamper rejection, Excel, classic Outlook, backup/restore, injected rollback, and upgrade journeys passed. Keep this document as the regression checklist for future releases.

## Prerequisites

- Windows 10 or Windows 11.
- Node.js 24.19.0, verified with `node --version`.
- pnpm 11.9.0 exactly, verified with `pnpm --version`.
- A clean clone of the private repository.

Do not use Node.js 25 or another Node 24 patch for the release build. The embedded runtime and native dependency build are deliberately pinned to 24.19.0.

## Clean-install check

In PowerShell at the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm build
pnpm --filter @project-manager/api exec node -e "const Database=require('better-sqlite3'); const db=new Database(':memory:'); console.log(db.prepare('select 1 as ok').get()); db.close()"
```

Expected result: the final command prints an object with `ok: 1`. Installation must not request a local C/C++ build toolchain. If it does, record the Node version, Windows architecture, and complete install output before changing dependencies.

## Local-data and health check

Use a disposable local data directory for this check:

```powershell
$env:PM_DATA_DIR = Join-Path $env:TEMP 'project-manager-dashboard-verification'
pnpm --filter @project-manager/api seed:demo
pnpm dev
```

With the development server running, open `http://127.0.0.1:5173/` and then visit `http://127.0.0.1:5173/api/health`.

Expected health response contains:

```json
{
  "status": "ok",
  "storage": {
    "engine": "sqlite",
    "migration": { "appliedCount": 1, "pendingCount": 0, "totalCount": 1 }
  }
}
```

Stop the development server, run `pnpm --filter @project-manager/api seed:demo` once more, and confirm it reports that existing demo records were left unchanged. This verifies the first migration and sample data are repeatable.

## Record results

Before declaring Windows support ready, record:

- Windows version and architecture.
- Node and pnpm versions.
- Whether the native SQLite module loaded without compilation.
- Output of all verification commands.
- Any antivirus, endpoint-security, or corporate-policy warning.

Outlook COM and final packaged-application verification are separate Phase 6 and Phase 7 checks.

## Build the portable x64 artifact

Run from the repository root on the matching x64 Windows build machine:

```powershell
powershell.exe -NoLogo -NoProfile -File .\release\build-windows-portable.ps1 `
  -Architecture x64 `
  -ApplicationVersion 0.1.0
```

The script downloads the pinned official runtime when it is not already cached, checks its committed SHA-256, repeats the frozen install/tests/lint/build, creates a physical production dependency tree, loads the packaged native SQLite module, generates and verifies `RELEASE-MANIFEST.json`, and produces `artifacts\ProjectManagerDashboard-0.1.0-win-x64.zip`.

For a controlled/offline build environment, download the exact archive named in `release\windows-portable.config.json` through an approved channel and pass `-RuntimeArchive C:\approved\node-v24.19.0-win-x64.zip`. The same committed digest is still required.

## Clean-machine portable verification

On a clean Windows 10/11 x64 account that does not have Node or pnpm installed:

1. Extract the ZIP to a normal user-writable application directory.
2. Disconnect the network before the first launch.
3. Run `verify-release.cmd`; it must report success.
4. Run `start-dashboard.cmd`; the default browser must open `http://127.0.0.1:4300`.
5. Open “本机诊断” and confirm Node 24.19.0, `win32`, `x64`, healthy SQLite, no pending migration, and a data directory under `%LOCALAPPDATA%\ProjectManagerDashboard`.
6. Create a database and record, close the browser, and run `start-dashboard.cmd` again. It must reuse the one healthy backend and reopen the same data.
7. Run `stop-dashboard.cmd`, confirm health is no longer reachable, and then start it again.
8. Confirm no SQLite database, backup, export, launcher state, or log was written beneath the extracted release directory.

Tamper with a disposable copy of one shipped file and confirm both `verify-release.cmd` and `start-dashboard.cmd` refuse to proceed. Restore from the original ZIP rather than editing the manifest.

## Offline functional and recovery matrix

While still offline, verify database/view/dashboard editing, static preview, both Excel downloads, Outlook HTML download, and clipboard fallback. Reconnect only for the classic Outlook COM check if company policy requires it.

Create a workspace backup, change the workspace, restore the backup with explicit confirmation, and run `start-dashboard.cmd` again. The launcher must detect the pending restore, gracefully restart the authenticated backend, reproduce the backed-up workspace exactly, and preserve its pre-restore backup. Repeat with the documented injected restore failure to confirm automatic rollback.

Finally, start the previous portable version with representative data, then run the new version's launcher. Record whether a pre-migration backup is created, the migration completes once, and all data remains available. Keep the old release ZIP and a manual `.pmdbackup` until the new version has passed this checklist.
