# Implementation Plan

## Delivery strategy

Build a vertical slice early: create two different databases, place them on one dashboard, export the result, and verify it in real Excel and classic Outlook. Avoid completing a large generic database editor before validating the report workflow.

## Phase 0A — Interactive product prototype

Status: completed — accepted by the user on 2026-08-03

Tasks:

- Build a local interactive web prototype with realistic requirement, key-matter, and risk data.
- Demonstrate multiple independently shaped database views on one dashboard.
- Demonstrate per-block filtering, sorting, collapsing, and export inclusion.
- Demonstrate database creation and field configuration without persistence.
- Demonstrate static Outlook report preview and Excel presentation-layout preview.
- Review the prototype with the user and record requested changes.

Exit criteria:

- The user confirms the dashboard information architecture and density.
- The user confirms the database/view configuration workflow.
- The user confirms the intended Outlook and Excel presentation direction.
- Any rejected interaction is documented before production implementation begins.

## Phase 0 — Repository and engineering foundation

Status: implementation complete on 2026-08-03 — Windows Node 24 LTS verification remains a manual target-machine check

Tasks:

- Initialize the TypeScript workspace and package manager.
- Create frontend, backend, shared-domain, and export packages/modules.
- Add linting, formatting, unit tests, and a basic end-to-end test.
- Add configuration for loopback-only local serving.
- Add SQLite and the first migration.
- Add a sample-data development command.
- Establish Windows CI or a repeatable Windows verification checklist.

Exit criteria:

- One command starts the local application.
- One command runs unit tests.
- The browser displays a health/status page backed by SQLite.

## Phase 1 — Dynamic database foundation

Status: in progress — P1-01 domain operations/local API and P1-02 web schema editor completed on 2026-08-03

Tasks:

- Implement database and field entities. Completed in P1-01.
- Implement supported first-release field types. Initial write validation completed in P1-01.
- Implement record persistence keyed by field ID. Completed in P1-01.
- Build database navigation and schema editor. Completed in P1-02.
- Build basic table viewing and inline editing.
- Add archive/recovery behavior.

Exit criteria:

- The user can create `需求跟踪` and `关键风险` with different schemas.
- Renaming a field preserves its data.
- Records survive application restart.

## Phase 2 — Views, filters, and sorting

Tasks:

- Define the typed filter expression tree.
- Implement the shared filter/sort evaluator.
- Build the filter editor.
- Save visible fields, order, widths, filters, and sorts as a view.
- Add view duplication and rename.
- Test field-type-specific operators and nested conditions.

Exit criteria:

- Two views of one database can have different columns and filters.
- Reloading the application restores the exact view configuration.
- Unit tests prove deterministic filtering and sorting.

## Phase 3 — Dashboard composition

Tasks:

- Implement dashboard and dashboard-block entities.
- Add database views as blocks.
- Support block reorder, title, description, collapse, and export inclusion.
- Preserve independent view configuration per block.
- Add the initial vertically stacked responsive dashboard layout.

Exit criteria:

- Requirement and risk views appear together on one page.
- Editing one view does not affect the other.
- Dashboard order survives restart.

## Phase 4 — Canonical report and preview

Tasks:

- Implement the format-neutral report model.
- Convert selected dashboard blocks into ordered report sections.
- Add title, period, density, completed-row, and empty-section options.
- Build static HTML report preview.
- Implement content escaping and export sanitization tests.

Exit criteria:

- Preview contains the same rows and order as the selected views.
- Preview has no editing or filtering controls.
- Chinese and long text render correctly.

## Phase 5 — Excel exports

Tasks:

- Implement editable multi-sheet workbook export.
- Implement pure base-grid span calculation.
- Implement presentation workbook generation with merged spans.
- Add styles, wrapping, row heights, print settings, and filenames.
- Add workbook validation tests and golden fixtures.
- Open generated files in desktop Excel on Windows for manual verification.

Exit criteria:

- Editable workbook filters and sorts normally and contains no merged data cells.
- Presentation workbook combines differently shaped modules on one sheet.
- Excel opens both files without repair warnings.

## Phase 6 — Classic Outlook draft integration

Tasks:

- Finalize conservative Outlook-compatible HTML templates.
- Implement rich-HTML clipboard fallback.
- Implement the Windows PowerShell/COM draft adapter.
- Detect Outlook integration availability and show actionable fallback errors.
- Verify preservation of the user's existing Outlook signature policy.
- Test classic Outlook with Chinese text, long content, multiple tables, and status colors.

Exit criteria:

- One action opens a visible classic Outlook draft with subject and formatted body.
- No code path sends the message.
- Clipboard/HTML fallback works when Outlook automation is unavailable.

## Phase 7 — Backup, packaging, and release hardening

Tasks:

- Add manual full-workspace backup and restore.
- Add automatic pre-migration backups.
- Package the local application for Windows.
- Add first-run setup and data-directory diagnostics.
- Test offline operation and upgrade migrations.
- Write user documentation and recovery instructions.

Exit criteria:

- A clean Windows machine can install and run the application.
- Backup/restore reproduces databases, views, dashboards, and settings.
- The application works without internet access.

## Deferred backlog

- Relation and rollup fields
- CSV/XLSX import wizard
- Formula fields
- Calendar, board, and timeline views
- Dashboard multi-column layout
- Recurring reminders
- Additional Outlook variants
- Multi-user and LAN deployment

## Milestone order

1. `M0 — Product direction`: Phase 0A.
2. `M1 — Structured data`: Phases 0–2.
3. `M2 — Usable dashboard`: Phase 3.
4. `M3 — Report pipeline`: Phases 4–5.
5. `M4 — Outlook workflow`: Phase 6.
6. `M5 — Personal release`: Phase 7.
