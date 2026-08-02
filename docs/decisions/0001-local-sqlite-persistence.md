# ADR-0001: Local SQLite persistence

- Status: accepted
- Date: 2026-08-03
- Scope: first-release local persistence, schema evolution, and pre-migration recovery

## Context

The application is a single-user local web application whose first production target is Windows. It needs flexible, user-defined database schemas, deterministic exports, offline operation, and safe upgrades without requiring a separately managed database server.

The persistence choice must also preserve each database's business terminology. A requirement database and a risk database cannot be forced into the same fixed set of columns.

## Decision

### Runtime and driver

- Target Node.js 24 LTS for the first Windows release.
- Use SQLite through stable `better-sqlite3` and the stable Drizzle ORM SQLite adapter.
- Pin exact installed versions in `pnpm-lock.yaml` and update them deliberately.
- Keep one long-lived application connection. The application is the only writer.
- Open the connection with foreign-key enforcement and a 5-second busy timeout.
- Use WAL journal mode and `synchronous = FULL`. The expected first-release data volume does not justify weakening durability for write throughput.

Node's built-in `node:sqlite` is not selected yet. As of this decision, Node documents it as release-candidate stability, and Drizzle's Node-SQLite guide installs release-candidate packages. It can be reconsidered when the target LTS runtime and stable Drizzle release both support it without release-candidate dependencies.

`better-sqlite3` is a native dependency, so P0-03 must verify a clean install on supported Windows and the eventual packaged application must include the correct Windows binary. Failure of that verification reopens only the driver decision, not the logical schema.

### Source of truth and migrations

- Drizzle TypeScript schema files are the logical schema source of truth.
- `drizzle-kit generate` produces ordered SQL migrations that are committed to Git and reviewed like application code.
- The application runs the embedded Drizzle migrator before accepting normal API traffic.
- Drizzle's migration ledger is the only migration-history table; the product does not maintain a second `migration_history` table.
- `drizzle-kit push` must never be used against a user's workspace database.
- A migration that removes or rewrites data must use an expand/migrate/contract sequence where practical and include a focused upgrade test.
- A failed migration stops writable startup. The application keeps the original error and backup path for recovery and does not attempt an automatic destructive rollback.

Startup migration order:

1. Resolve and create the application data and backup directories.
2. Open the existing database using the production connection settings.
3. Run `PRAGMA quick_check` and refuse migration if the existing database is unhealthy.
4. Compare bundled migrations with Drizzle's applied-migration ledger.
5. If migrations are pending and the database already contains a workspace schema, create and verify an online backup.
6. Apply pending migrations.
7. Run foreign-key and schema-readiness checks before opening the HTTP listener.

The pending-migration comparison is wrapped in our persistence module and covered by integration tests so Drizzle implementation changes cannot silently bypass the backup gate.

### Backup policy

- Use SQLite's online backup mechanism through `better-sqlite3#backup()`. Do not copy the live main file directly because WAL state may not be contained in that file.
- Write a pre-migration backup to a unique timestamped filename, verify it can be opened and passes `PRAGMA quick_check`, then mark it complete in a small JSON manifest.
- Keep the 10 newest automatic pre-migration backups. Never delete manual workspace backups through automatic retention.
- Never overwrite an existing backup filename.
- An import that can replace or rewrite existing data must pass through the same backup gate.
- Manual workspace export and restore remain Phase 7 work; they will use a consistent SQLite backup plus a versioned manifest rather than exposing a raw live database copy.

### Data directories

The platform adapter resolves these defaults:

| Platform | Application data root |
| --- | --- |
| Windows | `%LOCALAPPDATA%\ProjectManagerDashboard` |
| macOS development | `~/Library/Application Support/ProjectManagerDashboard` |
| Linux development | `$XDG_DATA_HOME/project-manager-dashboard`, falling back to `~/.local/share/project-manager-dashboard` |

Layout under the root:

```text
ProjectManagerDashboard/
  workspace.sqlite
  backups/
  exports/
  logs/
```

`PM_DATA_DIR` may override the root for development, automated tests, and diagnostics. Tests must always use an isolated temporary directory.

### Logical tables

All domain IDs are UUID strings and all timestamps are UTC epoch milliseconds. Normal user deletion archives data; physical purge is a separate confirmed operation.

| Table | Purpose and important columns |
| --- | --- |
| `workspaces` | Root container: `id`, `name`, timestamps. The first release creates one workspace but does not hard-code its ID. |
| `databases` | Independent user database: `workspace_id`, mutable name/description/color, navigation order, `next_sequence`, archive timestamp. |
| `fields` | Normalized field metadata: `database_id`, stable ID, mutable name, type, order, versioned configuration JSON, archive timestamp. |
| `records` | Rows: `database_id`, immutable per-database sequence number, versioned values JSON keyed by field ID, order, archive timestamp. |
| `views` | Saved table views: `database_id`, name, type, order, versioned configuration JSON containing visible fields, widths, filters, sorts, and display policy. |
| `dashboards` | Workspace dashboard metadata and order. |
| `dashboard_blocks` | Ordered links from a dashboard to a view, plus title override, description, collapsed state, and export inclusion. |
| `report_templates` | Workspace-owned versioned report options; recipient fields remain empty unless the user explicitly configures them. |
| `app_settings` | Installation-scoped key/value settings with versioned, validated JSON values. |

Foreign keys use restrictive behavior by default. Archiving a parent does not silently delete children. Permanent purge is an explicit transaction that handles children in a known order.

Required first indexes cover:

- workspace and navigation order for databases and dashboards;
- database, archive state, and order for fields, records, and views;
- dashboard and order for blocks;
- view references from dashboard blocks.

### Dynamic field and record representation

Field definitions are normalized rows. Record values remain a JSON object keyed by stable field ID:

```json
{
  "2a781ec8-73cd-4b65-b539-b47a77d4b5d4": "支持单点登录",
  "72ffaf31-9ccd-423b-94dc-c483799cfd4d": "in_progress"
}
```

Rules:

- Field names are never value keys; renaming a field changes metadata only.
- Empty values are omitted from the object rather than represented as `undefined`.
- Every JSON document type has an integer format version and a Zod validator in the domain package.
- Single-select, multi-select, and status values store stable option IDs. Option labels and colors live in the field configuration, so renaming an option preserves record meaning.
- Dates use `YYYY-MM-DD`; future date-time values use UTC ISO-8601 strings.
- Person/name is plain text in the first release because there is no user directory.
- Automatic sequence is a record column allocated transactionally from `databases.next_sequence`; a sequence field renders that value instead of duplicating it in JSON.
- Archived fields keep their JSON values so restoration is lossless. Permanent field purge removes the corresponding keys from all records in the same transaction.
- API writes validate values against the current, non-archived field definitions and reject unknown field IDs.

At the accepted first-release scale of 5,000 total records, the application loads the records required by a view and runs the shared typed filter/sort evaluator in the domain layer. Moving selected predicates into SQLite JSON queries requires benchmark evidence and must not create different browser/export semantics.

### View and report configuration

View configuration references only stable field and option IDs. It stores:

- visible field IDs and order;
- per-view width preferences;
- a typed filter expression tree;
- ordered typed sort clauses;
- archived/completed visibility policy;
- display density and future-compatible display options.

The configuration is parsed into a canonical domain type before use. Browser tables and all exports consume the same evaluated view result; renderers never interpret raw database JSON independently.

## Consequences

Benefits:

- Each user database remains semantically independent without SQL schema changes for every custom field.
- Renames are metadata-only and safe.
- SQLite files and verified backups are portable and work offline.
- Stable Drizzle and `better-sqlite3` releases avoid adopting two release-candidate layers in the persistence foundation.
- Normalized metadata still supports relational integrity and efficient navigation while JSON preserves flexible records and view configuration.

Costs and risks:

- Filtering JSON records in memory is less scalable than fully normalized value tables; the accepted first-release scale makes this a measured trade-off.
- JSON payloads require explicit runtime validation and payload-version migrations.
- `better-sqlite3` adds a native Windows packaging dependency that must be tested early.
- Restrictive foreign keys and recoverable archives require explicit purge workflows rather than simple cascading deletes.

## Rejected alternatives

### One SQL table per user database

Rejected because every field edit becomes a DDL migration, complicating safe renames, types, backups, and concurrent application upgrades.

### Universal fixed columns for every business module

Rejected because it destroys the requirement-specific and risk-specific terminology that motivated the product.

### Entity-attribute-value table for every cell

Rejected for the first release because it greatly increases joins and write complexity while providing little benefit at the target data scale. It remains a future option if indexed cross-database analytics becomes a core requirement.

### Built-in `node:sqlite` now

Deferred because its current documented stability and Drizzle integration both require release-candidate adoption. Its lack of an external native dependency is attractive and should be reevaluated after stabilization.

### libSQL or a remote database

Rejected because the first release is local-only, offline, and single-user; remote capability and additional packages add no current product value.

## Implementation acceptance checks

- A fresh temporary directory initializes the complete schema once.
- Reopening the same database is idempotent.
- Foreign-key enforcement is active on every application connection.
- A database, field, record, view, dashboard, and block round-trip with Chinese text.
- Renaming a field preserves its keyed record value.
- Invalid values and unknown field IDs are rejected.
- Sequence allocation is monotonic within one database and independent between databases.
- A pending migration creates a verified backup before changing schema.
- A simulated migration failure leaves the verified backup readable.
- Windows Node 24 LTS installs the pinned native dependency without local compilation and runs the persistence test suite.

## References

- [Node.js SQLite documentation](https://nodejs.org/api/sqlite.html)
- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [Drizzle Node SQLite guide](https://orm.drizzle.team/docs/sqlite/connect-node-sqlite)
- [Drizzle migration guide](https://orm.drizzle.team/docs/drizzle-kit-migrate)
- [`better-sqlite3` project documentation](https://github.com/WiseLibs/better-sqlite3)
- [`better-sqlite3` backup API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#backupdestination-options---promise)
