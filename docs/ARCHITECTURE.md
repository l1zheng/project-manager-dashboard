# Architecture

## 1. Status

This document records the initial architecture direction. It is a decision baseline for implementation, not a completed design. Update it when prototypes disprove an assumption.

## 2. Deployment model

The first release is a local web application:

```text
Browser on Windows
    ↕ HTTP on 127.0.0.1 only
Local Node.js application
    ├─ SQLite workspace database
    ├─ HTML report renderer
    ├─ Excel export engine
    └─ Windows Outlook bridge
            ↕ Outlook Object Model / COM
        Classic Outlook draft window
```

Reasons:

- The user wants a browser-based dashboard.
- Single-user local storage avoids account, network, and permission complexity.
- A local backend can access the filesystem and invoke the installed classic Outlook client.
- The same domain and export code can later be wrapped as a desktop application if packaging requires it.

The server must listen on `127.0.0.1`, not all interfaces, unless LAN access is explicitly added later.

## 3. Proposed stack

| Layer | Initial choice | Reason |
| --- | --- | --- |
| Language | TypeScript | Shared types across UI, API, domain, and exports. |
| Frontend | React + Vite | Mature component ecosystem and fast local development. |
| Table engine | TanStack Table | Headless control over dynamic fields, filters, and widths. |
| Drag/reorder | dnd-kit | Dashboard and field ordering without a fixed visual framework. |
| Backend | Node.js 24 LTS + Fastify | Supported production runtime, small local API, good TypeScript support, easy streaming downloads. |
| Validation | Zod | Runtime validation of dynamic schemas and API input. |
| Storage | SQLite + stable Drizzle ORM + `better-sqlite3` | Local, portable, migration-friendly; avoids release-candidate persistence dependencies. |
| Excel | ExcelJS | Supports styles, widths, merges, print settings, and `.xlsx`. |
| Tests | Vitest + Playwright | Unit tests for domain/export logic and browser journey tests. |
| Outlook bridge | PowerShell/COM adapter invoked by backend | Works with Windows classic Outlook without Microsoft Graph consent. |

Exact package versions will be selected during Phase 0 and locked in the package manager lockfile.

## 4. Domain model

### 4.1 Tables

Initial persistent entities:

- `workspaces`
- `databases`
- `fields`
- `records`
- `views`
- `dashboards`
- `dashboard_blocks`
- `report_templates`
- `app_settings`

Drizzle owns its internal applied-migration ledger; the product does not maintain a second `migration_history` table. The complete persistence decision, table responsibilities, JSON contracts, and alternatives are recorded in [ADR-0001](decisions/0001-local-sqlite-persistence.md).

### 4.2 Dynamic records

Field definitions are normalized, while record values are stored as JSON keyed by stable field ID.

Example:

```json
{
  "fld_requirement_name": "支持单点登录",
  "fld_owner": "张三",
  "fld_status": "进行中"
}
```

This is appropriate for the first-release scale and preserves schema flexibility. Filtering and sorting use a shared domain evaluator first; selected high-value filters may later be pushed into SQLite JSON queries if performance requires it.

Never use field names as storage keys. A rename must be metadata-only.

Select, multi-select, and status values also use stable option IDs rather than mutable labels. Automatic sequence numbers are allocated transactionally per database and stored on the record rather than duplicated in dynamic JSON.

All JSON payload types are versioned and validated at the persistence boundary. Normal user deletion is archival. Foreign keys are restrictive by default, and permanent purge is an explicit ordered transaction.

### 4.3 Connection and migration policy

- Use one long-lived application writer connection with foreign keys enabled, a 5-second busy timeout, WAL mode, and `synchronous = FULL`.
- Generate version-controlled SQL migrations from the Drizzle schema and run the embedded migrator before normal API traffic.
- Never apply `drizzle-kit push` to a user's database.
- Before applying pending migrations to an existing workspace, create and verify an online SQLite backup.
- Refuse writable startup after integrity-check or migration failure; do not overwrite the database with an automatic rollback.

## 5. Shared query pipeline

All presentation surfaces must use one query/evaluation pipeline:

```text
records
  → archived/completed policy
  → filter expression
  → sort expression
  → visible field projection
  → output adapter
       ├─ browser table
       ├─ HTML email report
       ├─ editable Excel
       └─ presentation Excel
```

This prevents the browser and exports from disagreeing about which records are visible.

Filter expressions are structured data, not executable code. A view stores an expression tree of field IDs, operators, and typed values.

The canonical operator, empty-value, nesting, and validation semantics are recorded in [ADR-0002](decisions/0002-shared-filter-semantics.md). This domain evaluator is the reference behavior for every presentation surface and any future SQLite optimization.

## 6. Report rendering

### 6.1 Canonical report model

The renderer first builds a format-neutral report model:

- Report metadata
- Ordered sections
- Section title and description
- Ordered visible fields
- Typed rows
- Display hints such as alignment, importance, and width preference

HTML and Excel adapters consume this model. Neither adapter queries the database directly.

The model is assembled only from the dashboard's evaluated view payloads: a block's saved visible-field order, widths, filtered/sorted rows, title override, description, and export-inclusion flag. Adapters receive no database IDs and must not re-evaluate filters. Every generated text value is escaped by the rendering adapter.

Automatic sequence values come from record metadata rather than dynamic values. Select, multi-select, and status option IDs are resolved to their current labels while building the report model, so no output adapter can accidentally expose persistence IDs. Report density, empty-section policy, and status highlighting are model options shared by every adapter.

### 6.2 Outlook HTML

Classic Outlook has stricter rendering behavior than modern browsers. The email adapter therefore uses:

- Nested/table-based layout where necessary
- Inline styles
- Explicit pixel widths for major columns
- Conservative fonts and colors
- No JavaScript
- No external stylesheets
- No flexbox or CSS grid
- Escaped plain user content

Outlook automation is isolated behind an interface:

```ts
interface MailDraftAdapter {
  isAvailable(): Promise<boolean>;
  createDraft(input: { subject: string; html: string; text: string }): Promise<void>;
}
```

The Windows implementation invokes a narrowly scoped PowerShell script that creates a classic Outlook `MailItem`, assigns `HTMLBody`, and calls `Display`. It never calls `Send`.

The Microsoft Outlook Object Model supports creating an item through `Application.CreateItem`, setting the HTML body, and displaying the item. This is the compatibility basis for the first-release integration.

### 6.3 Excel layout engine

Editable export maps each view to a normal worksheet table.

Presentation export uses a base grid. The initial algorithm:

1. Assign a preferred weight from field type.
2. Adjust it using header length and sampled visible content.
3. Apply user width preference when present.
4. Clamp each field to type-specific minimum and maximum spans.
5. Normalize spans so their sum equals the configured base grid, initially 60.
6. Resolve rounding using largest-remainder allocation.
7. Merge base cells for each field span and write values with wrapping.

The layout engine must be a pure tested function. Workbook generation consumes its span result but does not calculate layout itself.

## 7. Security boundaries

- Accept requests only from loopback by default.
- Use an unpredictable per-install local token or same-origin protection for state-changing endpoints.
- Escape all user content in report HTML.
- Do not execute formulas or user-authored scripts.
- Prefix potentially dangerous Excel values that begin with `=`, `+`, `-`, or `@` when exporting user text unless the field is explicitly a formula-capable type in a future release.
- Outlook integration receives generated HTML through a controlled temporary file or standard input; it must not execute arbitrary command text.
- Never automate the final Send action.

## 8. Backup and portability

- Store `workspace.sqlite` and backup/export/log subdirectories under `%LOCALAPPDATA%\ProjectManagerDashboard` on Windows. Use a platform adapter and `PM_DATA_DIR` override for development and tests.
- Provide a full workspace export containing the SQLite database plus a manifest.
- Create a verified online backup before pending migrations and destructive imports; do not copy a live WAL database file directly.
- Keep the 10 newest automatic pre-migration backups without deleting manual backups.
- Keep path resolution behind a platform adapter so development can run on macOS while Windows remains the deployment target.

## 9. Architecture decisions still to validate

- Whether the local application is distributed as a Node runtime bundle, a Windows installer, or later wrapped with Electron.
- Clean Windows installation and packaging of the pinned `better-sqlite3` native binary under Node.js 24 LTS.
- The most reliable clipboard HTML implementation across supported Windows browsers.
- Classic Outlook rendering of nested tables, Chinese fonts, long text, and status backgrounds.
- Performance threshold at which filter evaluation should move from memory to SQLite JSON queries.

These are prototype questions, not blockers for scaffolding the domain model.
