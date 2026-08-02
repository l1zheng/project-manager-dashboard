# Windows verification checklist

Run this checklist on the Windows PC intended to use the first release. It validates the local Node.js runtime and SQLite native module before Outlook integration work begins.

## Prerequisites

- Windows 10 or Windows 11.
- Node.js 24 LTS, verified with `node --version`.
- pnpm 11.9.0 or later, verified with `pnpm --version`.
- A clean clone of the private repository.

Do not use Node.js 25 for this checklist; it is end-of-life and not the project release target.

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
