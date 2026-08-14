# Product Requirements

## 1. Product summary

The product is a local project-management workspace for a single user. It preserves the freedom of separate Excel sheets while presenting multiple independent databases together on one web dashboard.

Its defining workflow is:

1. Open one workspace page that already contains all current report modules.
2. Create tables such as Requirement Tracking, Key Matters, and Key Risks directly on that page, or add explanatory text and local images between them.
3. Add or rename each table's business-specific columns from the table header and edit records inline.
4. Filter each table independently without leaving the page.
5. Export the current mixed page to Excel without manually rebuilding the layout.

## 2. User and environment

- Primary user: one project manager/developer.
- Primary OS: Windows.
- Deployment: local machine with no external SaaS dependency; a self-contained per-user Windows installer is the primary distribution, and a portable ZIP remains available.
- Primary language: Chinese; data and filenames must fully support Unicode.

## 3. Product principles

### 3.1 Preserve business semantics

Each database owns its schema. A requirement may have `需求名称`, while a risk may have `风险描述` and `风险消减措施`. The product must not force unrelated concepts into generic fields.

### 3.2 Separate source data from presentation

Source records remain structured and filterable. Presentation Excel and the report preview are static renderings optimized for reading.

### 3.3 A dashboard contains views, not raw database definitions

The same database may appear several times with different filters, sorts, visible fields, and widths.

### 3.4 Excel is the only reporting handoff

The first release exports the mixed page to Excel in two modes (editable data workbook and presentation workbook). Classic Outlook draft automation was evaluated and explicitly removed from the product scope; the report can still be pasted into Outlook manually from the presentation workbook.

### 3.5 Hide implementation concepts from the primary workflow

Databases, saved views, dashboards, and dashboard blocks remain valid internal concepts, but the normal user journey must feel like editing several Notion-style inline tables on one page. Creating a table automatically creates and places its default view. Schema management is performed from table headers; a separate database/field configuration page must not be required for routine work.

## 4. Core concepts

| Concept | Definition |
| --- | --- |
| Database | A user-defined collection with an independent schema and records. |
| Field | A typed column belonging to one database. |
| Record | One row of values stored by field ID. |
| View | Saved visible fields, widths, filters, sorting, and display options for a database. |
| Dashboard | A page containing ordered table, text, and image modules. |
| Dashboard block | One ordered page module: a configured database view, editable text, or a local image with an optional title and caption. |
| Report | A static rendering of selected dashboard blocks after table filters and sorting are applied. |

## 5. Functional requirements

### FR-1 Database management

The user can:

- Create, rename, duplicate, archive, restore, and delete a database.
- Define an optional database description and display color.
- Reorder databases in navigation.
- Import a simple worksheet or CSV into a new database in a later minor release.

Acceptance criteria:

- Creating a database does not require selecting a global schema.
- Creating a database automatically places an editable table on the current workspace page.
- Changing one database's fields does not affect another database.
- Deleting a database requires confirmation and is recoverable through an archive or backup until permanent deletion.

### FR-2 Field schema

First-release user-facing field types:

- Text, with multiline input and automatic wrapping
- Number
- Date
- Single select
- Multi-select
- Status
- Person/name
- Checkbox
- URL
- Automatic sequence number

The user can add, rename, reorder, configure, hide, and delete fields. Routine add/rename operations are available from the table header. Field values are stored against stable field IDs so renaming a field does not lose data.

The routine property menu does not expose separate short-text and long-text types. Existing persisted short/long text definitions remain compatible and project to the unified `Text` property; wrapping, width, alignment, and title emphasis are presentation concerns rather than different business data types.

Later field types:

- Relation
- Rollup
- Formula
- Attachment
- Created/updated metadata

### FR-3 Record editing

The table interface supports:

- Add, edit, duplicate, archive, and delete records.
- Inline editing for common field types.
- Multiline editing and expanded editing for text content.
- Keyboard-friendly navigation.
- Automatic text wrapping without changing other databases' layouts.
- Explicit empty values instead of merged source cells.

### FR-4 Saved views and filters

A view saves:

- Visible fields
- Field order
- Field widths
- Filters
- Sort order
- Whether archived/completed records are shown

Filters support nested `AND`/`OR` groups and operators appropriate to the field type, including equality, inequality, contains, empty, date before/after/between, and select membership.

Acceptance criteria:

- Changing a view's width or visible columns does not change other views.
- The same database can appear twice on a dashboard with different filters.
- Filter results are identical in the browser, Outlook report, and Excel exports.

### FR-5 Dashboard

The user can:

- Create and rename dashboards.
- Add a table, editable text, or local image as a dashboard block.
- Reorder blocks.
- Configure a block title and optional description.
- Collapse or expand blocks.
- Choose whether a block is included in export by default.
- Open the source database or edit the linked view.

The first release uses vertically stacked full-width modules. A table module owns an independent database view, a text module has a directly editable section title and multiline body, and an image module accepts a supported local image plus an optional title and caption. Multi-column freeform layout is deferred until the basic reporting workflow is reliable.

Primary-workflow acceptance criteria:

- Opening the application displays the workspace dashboard, not a schema configuration page.
- All modules assigned to the current workspace are visible together as vertically stacked editable blocks.
- The system creates the default view and dashboard placement automatically; the user does not need to understand or assemble those entities.
- Table title, column names, cell values, new rows, new columns, and per-table filters are editable in place.
- Text-module titles and bodies can be edited inline. Image modules can edit an optional title and caption and select, replace, or remove a local image without exposing filesystem paths.
- Editable table cells are vertically centered by default. Narrative text remains horizontally left-aligned; short metadata may be horizontally centered by field presentation settings.
- Transient export, filter, and column-property menus close when the user clicks outside them or presses `Escape`; closing an unsaved property menu discards its local draft.

### FR-6 Report preview

Before exporting, the user can preview the static report and choose:

- Which blocks to include.
- Report title and reporting period.
- Whether to include empty sections.
- Whether completed rows are included.
- Compact or comfortable row density.
- Status highlighting.

Interactive browser controls must not appear in the rendered report.

The primary workspace export defaults to every module on the page, including header-only empty tables. Text-module titles render at the same section-heading level as table titles. An image title renders at that level only when non-empty; an untitled image emits no placeholder heading. Text and image modules retain their page order in static report and presentation exports. Before any report or workbook request begins, pending inline saves must finish successfully so the exported values cannot lag behind the visible page.

### FR-7 Excel export

Two modes are required.

#### Editable data workbook

- One sheet per exported database/view.
- No merged cells in the data area.
- Frozen headers, filters, wrapping, sensible widths, and typed dates/numbers.
- Every populated header and data cell uses Excel-style black thin all-side borders so the exported range reads as a complete Excel table.
- Suitable for further sorting, filtering, and editing.
- Text and image modules are presentation content and do not become artificial database sheets.

#### Presentation workbook

- One report sheet containing dashboard sections in order.
- A fixed fine-grained base grid, initially targeted at 60 logical columns.
- Each visible business field receives an integer span based on field type, heading length, sampled content length, and optional user width preference.
- Adjacent base cells are merged to form the calculated business-field width.
- Module headings may span the entire report width.
- A table-module description is exported only when the user explicitly entered one; an empty description creates no subtitle and consumes no worksheet row.
- Text modules span the report width; supported image modules are embedded in page order with their optional captions.
- Styles, wrapping, row heights, borders, page orientation, print area, and repeated print headers are set automatically.
- Every calculated business-field header and value span has a black thin top, bottom, left, and right border; merged presentation cells must still form a complete table grid.

Acceptance criteria:

- Databases with different field counts appear in one sheet without manual restructuring.
- All spans in a section sum to the base-grid width.
- Important text fields receive more space than status, sequence, date, or owner fields.
- The generated workbook opens without repair warnings in desktop Excel.

### FR-9 Local data, backup, and recovery

- Persist data in a local SQLite database.
- Bind the application server to loopback by default.
- Provide manual backup/export of the full workspace.
- Use schema migrations and preserve prior data across application updates.
- Keep automatic rolling backups before destructive migrations or imports.

### FR-10 Windows installation and updates

- Provide a Windows 10/11 x64 Setup executable that installs for the current user without administrator rights.
- Include the application runtime and native SQLite dependency; end users must not install Node.js, pnpm, a compiler, or database software.
- Create Start Menu and optional desktop shortcuts that launch without a console window.
- Stop the authenticated running instance before an in-place update replaces application files.
- Uninstall application files and shortcuts without deleting `%LOCALAPPDATA%\ProjectManagerDashboard` or its workspace database.
- Retain the portable ZIP as an alternate distribution and recovery format.
- Support Authenticode signing of the launcher, uninstaller, and Setup executable when release credentials are configured. Unsigned test builds must be identified as such and must not claim a verified Windows publisher.

## 6. Non-functional requirements

- The normal dashboard should remain responsive with at least 20 databases, 10 dashboard blocks, and 5,000 total records on a typical office PC.
- All export paths must escape user-entered HTML.
- Export output must be deterministic for the same data and configuration.
- Core domain and export logic must have automated tests.
- The application must work without internet access after installation.
- No analytics, telemetry, or cloud synchronization in the first release.

## 7. Explicitly out of scope for the first release

- Real-time multi-user collaboration
- Organization-level permissions and SSO
- Cloud hosting or synchronization
- Mobile-native application
- Full Notion page editor
- Formula language
- Automated workflows and reminders
- Automatic email sending
- Classic Outlook draft automation and email export
- New Outlook and Outlook Web deep integration

## 8. Primary acceptance journey

1. Open the application and immediately see one workspace page.
2. Create `需求跟踪` on that page and add seven requirement-specific columns from its table header.
3. Create `关键风险` on the same page with risk-specific columns including `风险消减措施`.
4. Add and edit rows directly in both tables, then filter each table independently.
5. Reload and confirm both differently shaped tables remain together on the page.
6. Preview the page as a static weekly report.
7. Export both an editable workbook and a single-sheet presentation workbook.
