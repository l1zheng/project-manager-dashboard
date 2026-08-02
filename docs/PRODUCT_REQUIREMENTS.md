# Product Requirements

## 1. Product summary

The product is a local project-management workspace for a single user. It preserves the freedom of separate Excel sheets while presenting multiple independent databases together on one web dashboard.

Its defining workflow is:

1. Create databases such as Requirement Tracking, Key Matters, and Key Risks.
2. Give each database its own field names, field types, records, and saved views.
3. Place selected views together on one dashboard.
4. Filter and review work in the browser.
5. export the current report to a classic Outlook draft or to Excel without manually rebuilding the layout.

## 2. User and environment

- Primary user: one project manager/developer.
- Primary OS: Windows.
- Email client: Windows classic Outlook.
- Deployment: local machine; no external SaaS dependency.
- Primary language: Chinese; data and filenames must fully support Unicode.

## 3. Product principles

### 3.1 Preserve business semantics

Each database owns its schema. A requirement may have `需求名称`, while a risk may have `风险描述` and `风险消减措施`. The product must not force unrelated concepts into generic fields.

### 3.2 Separate source data from presentation

Source records remain structured and filterable. Email and presentation Excel exports are static renderings optimized for reading.

### 3.3 A dashboard contains views, not raw database definitions

The same database may appear several times with different filters, sorts, visible fields, and widths.

### 3.4 Safe email workflow

The application may create and display an Outlook draft. The user remains responsible for recipients, final review, and sending.

## 4. Core concepts

| Concept | Definition |
| --- | --- |
| Database | A user-defined collection with an independent schema and records. |
| Field | A typed column belonging to one database. |
| Record | One row of values stored by field ID. |
| View | Saved visible fields, widths, filters, sorting, and display options for a database. |
| Dashboard | A page containing ordered view blocks from one or more databases. |
| Dashboard block | One configured database view embedded in a dashboard. |
| Report | A static rendering of selected dashboard blocks after filters and sorting are applied. |

## 5. Functional requirements

### FR-1 Database management

The user can:

- Create, rename, duplicate, archive, restore, and delete a database.
- Define an optional database description and display color.
- Reorder databases in navigation.
- Import a simple worksheet or CSV into a new database in a later minor release.

Acceptance criteria:

- Creating a database does not require selecting a global schema.
- Changing one database's fields does not affect another database.
- Deleting a database requires confirmation and is recoverable through an archive or backup until permanent deletion.

### FR-2 Field schema

First-release field types:

- Short text
- Long text
- Number
- Date
- Single select
- Multi-select
- Status
- Person/name
- Checkbox
- URL
- Automatic sequence number

The user can add, rename, reorder, configure, hide, and delete fields. Field values are stored against stable field IDs so renaming a field does not lose data.

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
- Expanded record editing for long text.
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
- Add a database view as a dashboard block.
- Reorder blocks.
- Configure a block title and optional description.
- Collapse or expand blocks.
- Choose whether a block is included in export by default.
- Open the source database or edit the linked view.

The first release uses vertically stacked full-width table blocks. Multi-column freeform layout is deferred until the basic reporting workflow is reliable.

### FR-6 Report preview

Before exporting, the user can preview the static report and choose:

- Which blocks to include.
- Report title and reporting period.
- Whether to include empty sections.
- Whether completed rows are included.
- Compact or comfortable row density.
- Status highlighting.

Interactive browser controls must not appear in the rendered report.

### FR-7 Outlook export

Primary first-release behavior on Windows with classic Outlook:

1. Render an Outlook-compatible HTML report using table layout and inline styles.
2. Invoke the installed classic Outlook client locally.
3. Create a new HTML `MailItem` draft.
4. Set the subject and HTML body.
5. Display the draft for user review.

The application must not populate recipients unless the user explicitly configured a template, and it must never call Send automatically.

Fallbacks:

- Copy the rendered report to the clipboard as rich HTML and plain text.
- Download the rendered `.html` file.

Acceptance criteria:

- Export opens a visible draft rather than sending mail.
- Tables retain readable borders, widths, wrapping, headings, and status cues in classic Outlook.
- Unsupported CSS and scripts are absent.
- If Outlook automation is unavailable, the user receives a clear fallback action.

### FR-8 Excel export

Two modes are required.

#### Editable data workbook

- One sheet per exported database/view.
- No merged cells in the data area.
- Frozen headers, filters, wrapping, sensible widths, and typed dates/numbers.
- Suitable for further sorting, filtering, and editing.

#### Presentation workbook

- One report sheet containing dashboard sections in order.
- A fixed fine-grained base grid, initially targeted at 60 logical columns.
- Each visible business field receives an integer span based on field type, heading length, sampled content length, and optional user width preference.
- Adjacent base cells are merged to form the calculated business-field width.
- Module headings may span the entire report width.
- Styles, wrapping, row heights, borders, page orientation, print area, and repeated print headers are set automatically.

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
- New Outlook and Outlook Web deep integration

## 8. Primary acceptance journey

1. Create `需求跟踪` with seven requirement-specific fields.
2. Create `关键风险` with risk-specific fields including `风险消减措施`.
3. Add filtered views of both databases to one dashboard.
4. Change the requirement view without changing the risk view.
5. Preview the dashboard as a static weekly report.
6. Open the report as a formatted draft in classic Outlook.
7. Export both an editable workbook and a single-sheet presentation workbook.
