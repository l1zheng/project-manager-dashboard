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
- `media_assets`
- `report_templates`
- `app_settings`

Drizzle owns its internal applied-migration ledger; the product does not maintain a second `migration_history` table. The complete persistence decision, table responsibilities, JSON contracts, and alternatives are recorded in [ADR-0001](decisions/0001-local-sqlite-persistence.md).

### 4.2 Dynamic records

Field definitions are normalized, while record values are stored as JSON keyed by stable field ID.

The workspace interaction projection presents persisted short-text and long-text definitions as one user-facing `Text` property. This is a UI/domain projection rather than a destructive migration: existing field IDs and values remain unchanged. New text editing supports multiline content and wrapping, while width, report alignment, and title emphasis remain independent presentation metadata.

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

Field type and option edits are validated against every stored value for that field before commit. Values that remain valid under the new field definition are preserved. If any value would become invalid, the API returns an explicit conflict and performs no write; the browser may retry only after the user confirms clearing that one field. The confirmed clear, field-definition update, and any required saved-view filter repair run in one SQLite transaction. Option renames preserve stable option IDs, so records and completion semantics do not change merely because a label changes.

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

### 5.1 Primary interaction projection

The persistent domain model is intentionally richer than the normal UI. The browser's default surface is a single workspace canvas that projects the primary dashboard into vertically stacked editable modules:

```text
user creates a table
  → database is created
  → a default saved view is created automatically
  → the view is placed on the primary dashboard automatically
  → the editable table appears on the current page
```

An idempotent workspace bootstrap operation repairs missing default views or dashboard placements for active databases. This does not flatten schemas or duplicate records; it only assembles existing entities into the primary canvas. Database, view, and dashboard IDs remain the stable internal boundary used by filtering and exports.

Routine schema and record operations are projected into the table itself: database names are table titles, fields are column headers, and records are rows. The legacy entity-by-entity configuration flow is not the default UI and may only reappear later as an explicitly advanced management surface.

Dashboard blocks are polymorphic and ordered. Their stable `kind` is `table_view`, `text`, or `image`; versioned kind-specific configuration references a saved view, stores a text section title and body, or references a media asset with optional display title and caption. The normal UI calls them modules rather than exposing this persistence vocabulary. A table module continues to create its database/default view/placement as one user action.

Production image content is stored in a local `media_assets` table under a stable asset ID, with validated MIME type, bounded byte length, SHA-256 digest, original filename metadata, and the encoded bytes. Dashboard blocks reference only the asset ID—never an arbitrary local path or external URL. The initial allowlist is decoded PNG, JPEG, and GIF with a 10 MB per-image limit; SVG is excluded because it is active document content, and WebP is excluded until the production workbook adapter has a deterministic conversion path. Keeping assets inside SQLite preserves transactionality and the existing full-workspace `.pmdbackup` boundary.

## 6. Report rendering

### 6.1 Canonical report model

The renderer first builds a format-neutral report model:

- Report metadata
- Ordered table, text, and image blocks
- Section title and description
- Ordered visible fields
- Typed rows
- Display hints such as alignment, importance, and width preference

HTML and Excel adapters consume this model. Neither adapter queries the database directly.

Table report blocks are assembled only from the dashboard's evaluated view payloads: saved visible-field order, widths, filtered/sorted rows, title override, description, and export-inclusion flag. Text blocks carry escaped plain text; image blocks carry validated internal asset metadata and bytes. Adapters receive no database IDs or filesystem paths and must not re-evaluate filters. Every generated text value is escaped by the rendering adapter.

The browser preview and presentation Excel preserve the mixed dashboard order. The editable data workbook intentionally emits only table-view worksheets. Presentation Excel embeds decoded image bytes rather than links. Classic Outlook materializes only validated internal image assets into its unique request directory, attaches them with server-generated content IDs, and deletes the directory after the bridge returns. The bridge does not accept client-authored paths or general attachments.

For the Notion-style primary canvas, a section without an explicit block title uses the database's mutable business name, never the internal default view name. Browser report actions default to including empty sections and pass through an export gate that waits for the per-record inline-save queues; a failed save blocks export instead of producing a stale workbook.

Automatic sequence values come from record metadata rather than dynamic values. Select, multi-select, and status option IDs are resolved to their current labels while building the report model, so no output adapter can accidentally expose persistence IDs. Report density, empty-section policy, and status highlighting are model options shared by every adapter.

Completion is explicit metadata, never inferred from mutable labels such as `closed` or `已完成`. A database may have at most one active status field whose field configuration contains `completion.completedOptionIds`. The referenced values are stable option IDs; renaming either the field or an option does not change completion behavior. A database without this configuration has no completed records. When a report sets `includeCompleted` to false, the canonical report builder removes matching rows after the saved view has been evaluated, including when the completion status field is hidden from that view. The option defaults to true so existing reports do not silently lose rows.

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
  probe(): Promise<{ available: boolean; reason?: string }>;
  createDraft(input: {
    subject: string;
    htmlFragment: string;
    inlineImages?: Array<{
      contentId: string;
      mimeType: 'image/png' | 'image/jpeg' | 'image/gif';
      content: Uint8Array;
    }>;
  }): Promise<{ status: 'displayed' }>;
}
```

The Windows implementation invokes a committed, narrowly scoped PowerShell script using a fixed executable, `shell: false`, and a temporary UTF-8 JSON request. User content never appears in a command string or command-line argument. The Node adapter accepts only bounded, signature-matching PNG/JPEG/GIF bytes already resolved from internal media assets, writes them beside the request under generated filenames, and provides only those server paths to PowerShell. The script revalidates that every path remains within the request directory, adds the files as hidden CID attachments, creates a classic Outlook `MailItem`, calls `Display(false)` so Outlook initializes the compose editor and configured signature, then inserts the escaped report fragment immediately after the existing opening `<body>` tag. It never accepts recipients or calls `Save` or `Send`.

The Microsoft Outlook Object Model supports creating an item through `Application.CreateItem`, setting the HTML body, and displaying the item. This is the compatibility basis for the first-release integration.

The full process, signature, timeout, error-mapping, endpoint, fallback, and no-send decisions are recorded in [ADR-0003](decisions/0003-classic-outlook-draft-boundary.md).

Classic Outlook remains an optional convenience integration. The core release acceptance path is the local dashboard plus editable and presentation Excel exports; a macOS development environment cannot validate the real Windows COM compose window, and that target-machine verification is deferred until the user chooses to prioritize it.

### 6.3 Excel layout engine

Editable export maps each view to a normal worksheet table.

The editable adapter consumes the canonical report model and creates one worksheet for each included, non-empty report section. It never merges data cells. Headers are frozen and filtered; date fields are written as UTC date-only values with `yyyy-mm-dd` formatting, numeric/sequence fields remain numeric, and other values are literal text. User-controlled strings strip invalid XML control characters and gain a leading apostrophe when they begin with `=`, `+`, `-`, or `@`, preventing Excel formula injection. Saved view widths map to bounded worksheet widths, while field type supplies a readable fallback.

Presentation export uses a base grid. The initial algorithm:

1. Assign a preferred weight from field type.
2. Adjust it using header length and sampled visible content.
3. Apply user width preference when present.
4. Clamp each field to type-specific minimum and maximum spans.
5. Normalize spans so their sum equals the configured base grid, initially 60.
6. Resolve rounding using largest-remainder allocation.
7. Merge base cells for each field span and write values with wrapping.

The layout engine must be a pure tested function. Workbook generation consumes its span result but does not calculate layout itself.

The presentation adapter writes one `项目周报` worksheet: the report title, reporting period, and every section heading span all 60 base columns; each section independently merges its field headers and row values using the allocator output. A section-description row exists only when the canonical table block contains a non-empty description explicitly saved by the user; adapters never invent copy or fall back to the database description, and a missing description consumes no row. It uses landscape, fit-to-width printing, wrapped text, row-height profiles, and a print area covering the generated report. As with editable export, date-only values are written at UTC midnight and all untrusted text is made literal before writing.

Both Excel adapters share one restrained enterprise workbook theme. Default gridlines are hidden; title, section, column-header, body, and status roles use stable theme tokens rather than adapter-local colors. Every populated business-table header and value cell has Excel-default-style black thin borders on all four sides, including merged presentation spans, while stronger theme-colored rules remain reserved for module section breaks outside the table grid. Optional alternating row shading adds scanability without replacing the complete grid. Sequence, date, person, select, checkbox, and status fields are centered; narrative text stays left-aligned and numeric measures stay right-aligned. Recognized status labels receive low-saturation blue, green, amber, or red presentation cues, with a neutral fallback. This label-based tone is visual only and never determines completion, filtering, or other business behavior.

The implemented allocator uses 60 columns by default and returns one-based inclusive start/end columns for every visible field. Type-specific minimums and maximums are readability preferences rather than absolute constraints: normal layouts start from the preferred minimums, while schemas whose preferred minimums exceed the grid enter a deterministic compressed mode with a hard minimum of one column per field. Remaining columns are apportioned with the largest-remainder method using stable input order for ties. Preferred weight combines field type, heading length, the 80th-percentile display length from up to 50 sampled values, CJK/full-width character width, and an optional saved-view pixel width. A view with more visible fields than grid columns is rejected with an actionable error; editable Excel remains available for such schemas.

## 7. Security boundaries

- Accept requests only from loopback by default.
- Use an unpredictable per-install local token or same-origin protection for state-changing endpoints.
- Escape all user content in report HTML.
- Do not execute formulas or user-authored scripts.
- Prefix potentially dangerous Excel values that begin with `=`, `+`, `-`, or `@` when exporting user text unless the field is explicitly a formula-capable type in a future release.
- Outlook integration receives a bounded generated fragment and validated internal CID images through a unique temporary request directory; it must not execute arbitrary command text or accept client-authored HTML, recipients, arbitrary attachments, external paths, or script paths.
- Never automate the final Send action.

## 8. Backup and portability

- Store `workspace.sqlite` and backup/export/log subdirectories under `%LOCALAPPDATA%\ProjectManagerDashboard` on Windows. Use a platform adapter and `PM_DATA_DIR` override for development and tests.
- Provide a single `.pmdbackup` workspace export containing a verified SQLite online-backup snapshot and a versioned, checksummed manifest.
- Create a verified online backup before pending migrations and destructive imports; do not copy a live WAL database file directly.
- Validate restore archives as untrusted input, create a verified pre-restore backup, and apply replacement only during controlled startup before the normal database connection opens. Failed restore or forward migration returns to the pre-restore snapshot.
- Keep the 10 newest automatic pre-migration backups and the 10 newest automatic pre-restore backups without deleting manual backups.
- Keep path resolution behind a platform adapter so development can run on macOS while Windows remains the deployment target.

The first Windows release is an architecture-specific portable directory containing the pinned official Node.js 24.19.0 runtime, an isolated hoisted production dependency tree, built browser/API assets, migrations, Outlook bridge, authenticated launcher control, and small release metadata. It is built on the matching Windows architecture so the packaged `better-sqlite3` binary is valid. The build rejects symbolic links/junctions after removing unneeded command shims, validates the official runtime archive digest once, loads the packaged native SQLite module, and writes `RELEASE-INFO.json` with the application/runtime/target metadata needed by the launcher. It does not generate or recalculate a per-file hash manifest. Mutable data remains outside the application directory. Electron and Node single-executable packaging are not used in the first release.

The packaged CMD entrypoints invoke `launcher.mjs` through the bundled `node.exe`; normal startup and shutdown do not invoke PowerShell and therefore do not depend on PowerShell execution policy or script signatures. The launcher pins `127.0.0.1`, the configured non-privileged port, the built web directory, and `%LOCALAPPDATA%\ProjectManagerDashboard`. A random 256-bit token inherited only by the child process authenticates graceful local stop/restart requests. A second launch opens the already running instance; a pending restore or different packaged version first closes the authenticated old process and then starts the new one. The runtime-control route is not registered during ordinary development without a valid launch token. The optional classic Outlook adapter remains a separate PowerShell/COM integration and cannot block dashboard or Excel use.

The complete container, restore transaction, rollback, retention, packaging, and release-validation decisions are recorded in [ADR-0004](decisions/0004-backup-restore-and-windows-packaging.md).

The accepted V2 production-promotion contract, polymorphic-block migration, validated SQLite image boundary, saved-view presentation metadata, and mixed-report evolution are recorded in [ADR-0005](decisions/0005-v2-production-promotion.md).

## 9. Architecture decisions still to validate

- Clean Windows execution of the portable runtime bundle and its pinned `better-sqlite3` native binary under Node.js 24 LTS.
- Whether the accepted portable artifact needs a signed thin installer or console-free launcher for the target work computer's application policy.
- The most reliable clipboard HTML implementation across supported Windows browsers.
- Classic Outlook rendering of nested tables, Chinese fonts, long text, and status backgrounds.
- Performance threshold at which filter evaluation should move from memory to SQLite JSON queries.

These are prototype questions, not blockers for scaffolding the domain model.
