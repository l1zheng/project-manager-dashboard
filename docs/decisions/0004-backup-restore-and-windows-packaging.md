# ADR-0004: Workspace backup, restore, and Windows packaging

- Status: accepted
- Date: 2026-08-04
- Scope: Phase 7 manual backup/restore, recovery boundaries, and first Windows release packaging

## Context

The application is the source of truth for one user's project-management data. A failed restore or upgrade can lose databases, views, dashboard composition, and report settings, so recovery must be designed before the first release package is assembled.

The target Windows computer must also be able to run the application offline without a separately installed Node.js toolchain. The application already depends on `better-sqlite3`, which includes a platform-specific native binary, and on classic Outlook automation through a packaged PowerShell script.

## Decision

### Manual backup format

A manual workspace backup is one ZIP-compatible file with the `.pmdbackup` extension. It contains exactly two regular files at its root:

```text
manifest.json
workspace.sqlite
```

It does not contain automatic backups, generated exports, logs, temporary files, or WAL/SHM sidecars. All first-release workspace data and settings live in SQLite, so the verified database snapshot plus its manifest is a complete logical workspace backup.

`manifest.json` is UTF-8 JSON validated by a versioned shared-domain schema. Version 1 records:

- a fixed format identifier and integer format version;
- application version and UTC creation time;
- database filename, byte length, and SHA-256 digest;
- a migration-ledger fingerprint used for compatibility diagnostics;
- optional non-authoritative workspace ID and display name for the restore confirmation screen.

The application creates `workspace.sqlite` through SQLite's online backup API, never by copying the live main database file. It opens the snapshot read-only, requires `PRAGMA quick_check` to return `ok`, requires `PRAGMA foreign_key_check` to return no rows, computes the digest, writes the manifest, and only then publishes the completed archive. A partial archive is never offered as a successful backup.

Manual backups are user-owned downloads and are never deleted by automatic-retention code. Internal pre-migration and pre-restore backups use separate filename prefixes and retention groups.

### Restore validation and compatibility

A restore archive is untrusted input even when it came from the same computer. The API streams it into a unique staging directory beneath the application data root and validates it before changing live state:

1. Enforce bounded compressed and uncompressed sizes and reject duplicate entries.
2. Require exactly the two expected root files; reject absolute paths, traversal components, links, devices, and nested entries.
3. Parse the manifest with the supported versioned schema and use a timing-safe digest comparison where practical.
4. Open the staged database read-only and run quick, foreign-key, schema-readiness, and migration-ledger checks.
5. Require the database's applied migrations to be a valid prefix of the migrations bundled with the running application. Older backups may be migrated forward; backups created by a newer or divergent application are rejected with a no-write compatibility error.
6. Show the workspace identity, creation time, source application version, and the fact that restore replaces the current workspace before accepting explicit confirmation.

First release supports complete replacement only. It does not merge records or restore selected databases.

### Controlled restore and rollback

The application never swaps `workspace.sqlite` while its normal persistence connection is open.

After validation and explicit confirmation, the running application:

1. Creates and verifies an online `pre-restore-*` backup of the current workspace.
2. Copies the already verified candidate into a unique same-volume restore-staging path.
3. Writes a bounded `pending-restore.json` marker through a temporary file and atomic rename. The marker references only generated relative filenames beneath the data root and includes the expected candidate digest and pre-restore backup.
4. Returns a `restartRequired` result to the browser; the packaged launcher performs a controlled backend restart.

Before opening the normal persistence connection, the startup restore coordinator revalidates the marker and candidate, installs the candidate through same-volume renames, removes only the exact stale `workspace.sqlite-wal` and `workspace.sqlite-shm` sidecars after the old connection has closed, and then opens, checks, and migrates the restored database. The uploaded archive remains unchanged until success.

If validation, opening, or migration fails, startup closes the candidate and restores the verified pre-restore snapshot before accepting traffic. It preserves diagnostics and the failed candidate for recovery rather than repeatedly retrying. An interrupted switch is resolved from explicit transaction-state fields in the marker; startup never guesses from broad filename patterns.

The browser may expose restore progress, but it cannot bypass the confirmation, backup, restart, or verification gates.

### Automatic backup retention

- Keep the 10 newest verified `pre-migration-*` backups.
- Keep the 10 newest verified `pre-restore-*` backups.
- Delete a database and its manifest as one logical retention item; tolerate and report an already missing manifest without deleting unrelated files.
- Never match or delete manual `.pmdbackup` files through automatic prefixes.
- Diagnostics show the newest successful automatic backup and any failed retention operation.

### Windows release shape

The first release is a self-contained, architecture-specific Windows application directory distributed as a ZIP artifact. It contains:

```text
ProjectManagerDashboard/
  start-dashboard.cmd
  stop-dashboard.cmd
  verify-release.cmd
  launcher/launcher.mjs
  runtime/node.exe
  app/server-and-web-build
  app/node_modules
  app/migrations
  app/scripts/outlook-draft.ps1
  RELEASE-INFO.json
```

The exact internal paths may change without affecting product data. `RELEASE-INFO.json` records the application version, target architecture, embedded Node version, and loopback launcher settings. It is runtime metadata, not an exact-file integrity manifest.

Packaging rules:

- Embed the pinned official Node.js 24.19.0 Windows runtime; the target machine does not install Node or pnpm. The build configuration records the official x64 and ARM64 archive URLs and SHA-256 digests, and extraction proceeds only after a digest match.
- Build the release on the matching Windows architecture with the frozen lockfile so `better-sqlite3` is the correct Windows binary. Do not construct the final native-dependency tree on macOS and relabel it as Windows.
- Use modern `pnpm deploy --prod` from the frozen injected-workspace lockfile with a hoisted physical dependency layout, then add the built browser assets, migrations, Outlook script, and runtime. Remove unneeded `.bin` command links and reject every remaining symbolic link or junction before publishing the ZIP.
- Validate the official Node archive digest once during the trusted build. Do not traverse and hash thousands of packaged application files at every user startup; Windows CI instead extracts the exact ZIP and exercises the running product end to end before publication.
- Serve the production browser build from the same loopback Fastify process. The launcher binds only to `127.0.0.1`, waits for a health response, and opens the default browser.
- Use CMD only as a thin entrypoint into `launcher.mjs` running on the bundled Node runtime. Normal start, stop, and structural checks do not invoke PowerShell; the separately scoped PowerShell/COM Outlook bridge remains optional.
- Use a per-process random launcher token to authenticate graceful stop/restart calls. A second launch reuses the healthy same-version process; a pending restore or version change closes the authenticated process before starting the packaged version. The token is never exposed by diagnostics or release files.
- Store all mutable data under `%LOCALAPPDATA%\ProjectManagerDashboard`, outside the release directory, so replacing application files cannot overwrite user data.
- Require no network connection after the artifact is obtained. Do not add an automatic updater in the first release.
- Make the portable artifact the canonical tested release. A later signed installer may be a thin wrapper around the same directory, but it must not introduce another application runtime or move workspace data into the install directory.

The first package candidate is Windows x64. Before release, the target work computer's architecture is recorded; an ARM64 target uses its separately pinned ARM64 Node archive and requires a matching native dependency build rather than emulation being assumed.

The launcher initially favors transparent behavior and actionable logs over hiding failures. A console-free signed native launcher is an optional release-polish task after the portable package passes the clean-machine checklist.

### Packaging alternatives

Electron is not selected. The product already has a browser UI and local server, so bundling Chromium would add size, update obligations, and another security boundary without enabling a required first-release feature.

Node single-executable applications are not selected for the first release. Node documents the feature as active development, and native addons included as assets must be written to disk and loaded explicitly with `process.dlopen()`. Keeping an ordinary runtime directory makes the native SQLite dependency and migration assets visible and testable.

A raw source checkout plus globally installed Node/pnpm is not a release package. It is retained only for development.

### Release diagnostics and validation

The application exposes a local diagnostics view containing application/runtime versions, target architecture, loopback address, data directory, database health, migration state, latest verified automatic backup, available free space, and Outlook adapter probe result. It must not display local tokens or user record contents.

The release gate includes:

- first run from a clean supported Windows account with no Node installation;
- browser launch, restart, and second-instance behavior;
- offline database, dashboard, Excel, HTML, and fallback operation;
- classic Outlook draft validation when available;
- backup, destructive restore confirmation, restart, exact workspace reproduction, and rollback after injected failure;
- upgrade from the previous release with a verified pre-migration backup;
- extraction of the exact candidate ZIP followed by structural checks, first start, repeat start, authenticated stop, restart persistence, mixed-module editing, saved filters, both Excel exports, Outlook HTML, and workspace backup;
- a check that no mutable data is written into the application directory.

## Consequences

Benefits:

- A backup is one portable file with explicit integrity and compatibility metadata.
- Restore cannot silently overwrite the live database from an unchecked upload.
- Crash recovery is deterministic because replacement happens before the persistence connection opens and has a verified rollback source.
- The Windows target needs no development toolchain or internet connection.
- The ordinary runtime directory avoids fragile native-addon extraction in a single executable.

Costs and risks:

- Restore requires a controlled process restart and launcher coordination.
- Packaging must run on Windows for each supported architecture.
- A portable ZIP is less polished than a signed installer and may show a console window initially.
- ZIP parsing, staging cleanup, and interrupted-restore states need adversarial tests.
- Code signing and corporate application allow-listing remain deployment-environment concerns.

## Implementation order

1. Extract reusable database verification, digest, backup-kind, and retention primitives from the existing pre-migration backup code.
2. Implement and test `.pmdbackup` creation and download.
3. Implement archive validation and a non-destructive restore-inspection endpoint.
4. Implement explicit confirmation, pre-restore backup, pending marker, startup swap, rollback, and recovery diagnostics.
5. Serve the built web application from Fastify and add first-run/diagnostics behavior.
6. Add the Windows production-deploy script, Node launcher, and compact release metadata.
7. Run the clean-Windows/offline/upgrade/recovery matrix before considering an installer wrapper.

## References

- [SQLite Online Backup API](https://sqlite.org/backup.html)
- [`better-sqlite3` backup API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#backupdestination-options---promise)
- [pnpm deploy](https://pnpm.io/cli/deploy)
- [Node.js single executable applications](https://nodejs.org/download/release/v24.19.0/docs/api/single-executable-applications.html)
- [Node.js 24 downloads](https://nodejs.org/en/download/archive/v24)
