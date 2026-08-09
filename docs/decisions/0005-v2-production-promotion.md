# ADR-0005: Promote the accepted V2 workspace interaction to production

- Status: accepted
- Date: 2026-08-09
- Scope: V2 interaction reuse, polymorphic page modules, local image assets, view presentation metadata, and backward-compatible migration

## Context

Hands-on use rejected the Phase 8 production workspace even though its underlying database, view, filter, and export pipeline were correct. The accepted `/prototype-v2` surface is now the product interaction contract: one Notion-style page, contextual anchored menus, inline table editing, a bottom blank row that creates records automatically, independent table layouts, mixed table/text/image modules, one canonical module order, and a static full-page export preview.

The prototype is in memory. Production already contains user data in SQLite and an older `dashboard_blocks` table whose `view_id` is mandatory. Promotion must therefore preserve every existing database, field, record, view, dashboard, and table block while adding text and image blocks without introducing a second page model.

## Decision

### Accepted UI is the implementation contract

Production extracts or directly reuses the accepted V2 table, module, popover, resize, reorder, blank-row, filter, and preview components. It does not rebuild a visually similar interface around the older Phase 8 controls.

The following V2 behavior is invariant during promotion:

- schema editing opens from the clicked column header and uses one user-facing multiline-capable `文本` type;
- outside click and `Escape` dismiss transient menus and discard unsaved property drafts;
- column widths and order are view state and never change another table;
- the bottom blank row creates a record after the first meaningful value is committed;
- table, row, and property overflow actions are functional and destructive actions require in-context confirmation;
- table, text, and image modules use one persisted order shared by the page, sidebar, and exports;
- export preview is static and contains no editing controls;
- implementation terms such as database, saved view, and dashboard block remain absent from the routine UI.

### Polymorphic dashboard blocks

`dashboard_blocks` is rebuilt by a versioned migration with these logical fields:

- `kind`: `table_view`, `text`, or `image`;
- nullable `view_id`, used only by `table_view`;
- nullable `media_asset_id`, used only by `image` and allowed to remain null before the user selects a file;
- `config_version` and validated `config_json`;
- existing dashboard ownership, stable ID, order, collapse/export flags, and timestamps;
- `archived_at` for recoverable module removal.

Version-1 block configurations are:

```ts
type TableViewBlockConfig = {
  version: 1;
  titleOverride: string | null;
  description: string | null;
};

type TextBlockConfig = {
  version: 1;
  title: string;
  body: string;
};

type ImageBlockConfig = {
  version: 1;
  title: string | null;
  caption: string | null;
};
```

Database/view relationships remain normalized foreign keys rather than being hidden inside JSON. A database created from the page still creates one default view and one `table_view` block in the same transaction.

The migration copies every legacy block as `table_view`, retains its IDs/order/flags/timestamps and `view_id`, and moves `title_override` plus `description` into validated version-1 config. No record or view data is rewritten. The normal pre-migration verified backup gate remains mandatory.

### Local image assets

`media_assets` stores workspace-owned, immutable image content:

- stable asset ID and workspace foreign key;
- validated MIME type from the allowlist PNG, JPEG, and GIF; WebP is deferred until deterministic workbook conversion exists;
- bounded decoded byte length, initially 10 MB;
- SHA-256 digest, original filename metadata, and raw bytes;
- timestamps and archive state.

The server validates both declared MIME type and decoded file signature. SVG, external URLs, filesystem paths, and arbitrary attachment paths are rejected. Normal dashboard payloads expose metadata and a same-origin content URL, not raw bytes. Image creation/replacement uses a bounded raw-body endpoint and a database transaction so a failed block mutation cannot leave an unreferenced asset.

### Field presentation belongs to the saved view

V2 column width, order, horizontal report alignment, and row-title emphasis are view presentation state. The existing view config remains version 1 for backward compatibility and gains a default-empty `fieldPresentation` map keyed by stable field ID:

```ts
type FieldPresentation = {
  reportAlign?: 'left' | 'center' | 'right';
  reportEmphasis?: 'normal' | 'strong';
};
```

Old view JSON parses with an empty map. Existing persisted `short_text` and `long_text` types both project to the single V2 `文本` option. New text columns use `long_text`; existing field IDs and types are not rewritten merely to change the UI label.

### Atomic order and duplication

Module reordering uses one atomic dashboard-order command containing every active block ID exactly once. Column order and widths update the linked view configuration. Table duplication copies the database schema, records, default view configuration, and page placement in one transaction with new stable IDs; option/value references are remapped. Row duplication creates a new sequence number while copying validated field values. Table deletion archives its database and its owned page placement after confirmation; shared-view deletion semantics remain an advanced future concern.

### Canonical mixed report

The canonical report model becomes an ordered union of table, text, and image blocks. Browser preview, Outlook HTML, and presentation Excel consume that one order. Editable Excel intentionally projects only table blocks.

Presentation Excel embeds validated image bytes. Outlook image support extends the existing bridge only with server-generated content IDs and temporary files materialized from validated internal assets; client-authored paths and arbitrary attachments remain forbidden. The draft adapter still has no recipient or send capability.

Table descriptions remain strictly opt-in. No database description, example copy, or placeholder subtitle is synthesized.

## Consequences

Benefits:

- The accepted interaction becomes the production surface without flattening the mature persistence and export foundations.
- Existing workspaces migrate losslessly because table data and saved views are unchanged.
- Text and images remain first-class page content rather than artificial databases.
- Backup/restore stays self-contained because media bytes live in SQLite.
- One stable module order eliminates page/sidebar/export drift.

Costs and risks:

- Rebuilding `dashboard_blocks` is a schema migration and therefore requires upgrade coverage and the existing verified backup gate.
- Embedded images add memory and workbook-size pressure; byte and count limits must be enforced before rendering.
- Table duplication is a multi-entity transaction and requires explicit ID remapping tests.
- Classic Outlook CID behavior must be rechecked on the target Windows computer after the bridge extension.

## Rejected alternatives

### Keep separate production and V2 component trees

Rejected because it would recreate the drift that caused the Phase 8 rejection.

### Store text and images as special databases

Rejected because it exposes artificial schemas, complicates editing, and violates the accepted page model.

### Store image filesystem paths or data URLs in block JSON

Rejected because paths are non-portable and unsafe, while data URLs inflate JSON and weaken backup/integrity boundaries.

### Make every block field generic JSON

Rejected because view and asset references require relational integrity and efficient ownership validation.

## Acceptance checks

- Upgrade a real-format legacy fixture and prove every prior table block ID, view reference, order, and flag is preserved.
- Reload and retain mixed table/text/image order.
- Reject invalid image signatures, MIME types, oversized bodies, cross-workspace references, and arbitrary paths.
- Prove view width/order/presentation changes affect only that view.
- Complete the V2 browser checklist against SQLite data rather than in-memory fixtures.
- Export the same mixed order to preview and presentation Excel; editable Excel contains only table sheets.
- Repeat classic Outlook image/signature/no-send acceptance on Windows.
