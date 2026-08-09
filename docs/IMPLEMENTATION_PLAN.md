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

Status: completed — implementation completed on 2026-08-03 and Windows x64 runtime verification accepted on 2026-08-09

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

Status: completed on 2026-08-03 — P1-01 through P1-04 delivered

Tasks:

- Implement database and field entities. Completed in P1-01.
- Implement supported first-release field types. Initial write validation completed in P1-01.
- Implement record persistence keyed by field ID. Completed in P1-01.
- Build database navigation and schema editor. Completed in P1-02.
- Build basic table viewing and inline editing. Completed in P1-03.
- Add archive/recovery behavior. Completed in P1-04.

Exit criteria:

- The user can create `需求跟踪` and `关键风险` with different schemas.
- Renaming a field preserves its data.
- Records survive application restart.

## Phase 2 — Views, filters, and sorting

Status: completed — P2-01 through P2-06 completed on 2026-08-03

Tasks:

- Define the typed filter expression tree. Completed in P2-01.
- Implement the shared filter evaluator. Completed in P2-01; typed sorting follows with saved views.
- Persist typed saved-view configuration and evaluate saved views. Completed in P2-02.
- Build the field-type-aware single-condition filter editor. Completed in P2-03.
- Save visible fields, field order, widths, and a primary sort as a view. Completed in P2-04.
- Add view duplication and rename. Completed in P2-05.
- Add a browser editor for nested `AND`/`OR` conditions. Completed in P2-05; evaluator coverage was established in P2-01.
- Add archive/restore behavior for saved views. Completed in P2-06.

Exit criteria:

- Two views of one database can have different columns and filters.
- Reloading the application restores the exact view configuration.
- Unit tests prove deterministic filtering and sorting.

## Phase 3 — Dashboard composition

Status: completed — P3-01 through P3-03 completed on 2026-08-03

Tasks:

- Implement dashboard and dashboard-block entities.
- Add database views as blocks.
- Support block reorder, title, description, collapse, and export inclusion.
- Preserve independent view configuration per block.
- Add the initial vertically stacked responsive dashboard layout.
- Add block title, collapse, export-inclusion, and order controls. Completed in P3-03.

Exit criteria:

- Requirement and risk views appear together on one page.
- Editing one view does not affect the other.
- Dashboard order survives restart.

## Phase 4 — Canonical report and preview

Status: completed — P4-01 through P4-04 completed on 2026-08-03

Tasks:

- Implement the format-neutral report model. Completed in P4-01 and hardened in P4-02.
- Convert selected dashboard blocks into ordered report sections. Completed in P4-01.
- Add title, period, density, status-highlight, empty-section, and completed-row options. Completed in P4-03/P4-04.
- Build static HTML report preview. Completed in P4-02.
- Implement content escaping and export sanitization tests. Initial escaping coverage completed in P4-01/P4-02.
- Add explicit per-database completion semantics using stable status option IDs. Completed in P4-04; one active status field per database may own one or more completed option IDs.

Exit criteria:

- Preview contains the same rows and order as the selected views.
- Preview has no editing or filtering controls.
- Chinese and long text render correctly.

## Phase 5 — Excel exports

Status: completed — P5-01 through P5-03 completed on 2026-08-04 and Windows desktop Excel verification accepted on 2026-08-09.

Tasks:

- Implement editable multi-sheet workbook export. Completed in P5-02 with typed cells, frozen/filtered headers, safe literal text, and browser download.
- Implement pure base-grid span calculation. Completed in P5-01 with deterministic largest-remainder allocation, content/field-type/view-width weighting, and dense-layout handling.
- Implement presentation workbook generation with merged spans. Completed in P5-03 with one 60-column report worksheet and independently allocated section spans.
- Add styles, wrapping, row heights, print settings, and filenames. Completed in P5-03 for both download modes.
- Add workbook validation tests and golden fixtures. Completed in P5-02/P5-03 with workbook reload tests and independent rendered workbook checks.
- Open generated files in desktop Excel on Windows for manual verification. Completed during P7-07 acceptance on 2026-08-09.

Exit criteria:

- Editable workbook filters and sorts normally and contains no merged data cells.
- Presentation workbook combines differently shaped modules on one sheet.
- Excel opens both files without repair warnings.

## Phase 6 — Classic Outlook draft integration

Status: completed — implementation completed on 2026-08-04 and Windows classic Outlook acceptance completed on 2026-08-09.

Tasks:

- Finalize the local process, signature preservation, no-send, and fallback contract. Completed in P6-01.
- Finalize conservative Outlook-compatible HTML templates. Completed in P6-02 with escaped table/inline-style HTML, text fallback, and single-line subjects.
- Implement rich-HTML clipboard fallback. Completed in P6-02 with browser `text/html` plus `text/plain` clipboard data after a direct user gesture.
- Implement the Windows PowerShell/COM draft adapter. Completed in P6-02 with a packaged PowerShell bridge, JSON request file, timeout, and no-send script scan.
- Detect Outlook integration availability and show actionable fallback errors. Completed in P6-02; macOS returns a safe platform-unsupported response with HTML/clipboard fallback.
- Verify preservation of the user's existing Outlook signature policy. Completed during P7-07 acceptance on 2026-08-09.
- Test classic Outlook with Chinese text, long content, multiple tables, and status colors. Completed during P7-07 acceptance on 2026-08-09.

Exit criteria:

- One action opens a visible classic Outlook draft with subject and formatted body.
- No code path sends the message.
- Clipboard/HTML fallback works when Outlook automation is unavailable.

## Phase 7 — Backup, packaging, and release hardening

Status: completed — P7-01 through P7-08 and the Windows x64 acceptance matrix completed by 2026-08-09.

Tasks:

- Define the backup container, restore transaction, rollback, retention, and Windows release shape. Completed in P7-01.
- Add verified `.pmdbackup` full-workspace creation and download. Completed in P7-02.
- Add bounded restore inspection, explicit confirmation, pre-restore backup, controlled restart, startup replacement, and rollback. Completed in P7-03 with strict archive/migration validation, pending-state read-only protection, interrupted-state recovery, preserved diagnostics, automated rollback tests, and an isolated browser restart verification.
- Generalize and test automatic pre-migration and pre-restore retention. Completed in P7-04 with separate 10-item groups, strict generated-filename recognition, bounded deletion diagnostics, and adversarial retention tests.
- Serve the production web build from the loopback API and add first-run/data-directory diagnostics. Completed in P7-05 with same-origin static assets, safe client-route fallback, and a no-record-content runtime diagnostics view.
- Build an offline Windows portable artifact with a pinned Node 24 LTS runtime and matching native dependencies. Completed in P7-06 with a Windows-only frozen build pipeline, pinned Node 24.19.0 archives, physical production deployment, native SQLite self-test, authenticated launcher restart, and full-file integrity manifest; final artifact execution remains in the P7-07 Windows matrix.
- Test clean-machine installation, offline operation, upgrade migrations, and injected restore failure. Completed in P7-07 on 2026-08-09.
- Write user documentation and recovery instructions. Completed in P7-08 with the 0.1.0 user guide and release notes on 2026-08-09.

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

## Phase 9 — V2 interaction-shell validation

Status: prototype and browser checklist completed on 2026-08-09; iterative hands-on acceptance in progress

Reason:

Phase 8 hid the internal entity workflow but retained several non-contextual controls, including a fixed-corner column property editor and explicit row creation. Hands-on feedback confirmed that matching the information architecture is insufficient; the production shell must also match the direct interaction model of an inline database.

Tasks:

- Write a concrete interaction and acceptance specification. Tracked in `docs/V2_INTERACTION_PROTOTYPE.md`.
- Build an in-memory `/prototype-v2` route that cannot mutate production data. Completed.
- Anchor column, filter, and export popovers to their initiating controls with outside-click and `Escape` dismissal. Completed.
- Prototype per-table column resizing and drag reordering. Completed.
- Prototype automatic row creation from the bottom blank row. Completed.
- Complete property, table, and row deletion/duplication actions so no overflow control is inert. Completed.
- Consolidate short/long text into one multiline-capable user-facing text property while retaining a compatibility projection for existing persisted types. Prototype completed; production projection remains part of promotion.
- Prototype a complete-page static report and Excel-layout preview. Completed.
- Prototype per-field export alignment and row-title emphasis instead of guessing presentation from mutable field names. Completed.
- Vertically center editable table cells so multiline narrative content does not leave neighboring metadata controls pinned to the top. Completed in the prototype.
- Generalize the page from table-only blocks to ordered table, text, and image modules, with inline text editing, local image selection/replacement, captions, module navigation, and mixed export preview. Completed in the prototype.
- Reorder every module kind from an in-context drag handle, with explicit up/down menu commands as the precise and keyboard-accessible fallback; sidebar and export order share the same state. Completed in the prototype.
- Give text modules an editable large section title, reuse it in sidebar navigation, and render it at the same report hierarchy as a table title. Completed in the prototype.
- Give image modules an optional editable section title; render the heading in navigation and static exports only when supplied, without inventing an export placeholder. Completed in the prototype.
- On promotion, add polymorphic dashboard-block persistence, bounded SQLite media assets, mixed canonical report blocks, presentation-Excel image embedding, and a reviewed Outlook CID-image extension. Pending production integration.
- Obtain hands-on user acceptance before reconnecting the shell to SQLite.

Exit criteria:

- The V2 acceptance checklist is completed in a browser.
- The user confirms the interaction direction, including mixed page modules.
- Production integration can reuse the accepted components rather than rebuilding them independently.

## Phase 8 — Notion-style workspace correction

Status: implementation and active Mac workspace browser verification complete; user workflow acceptance pending

Reason:

Real-use feedback on 2026-08-09 showed that the production UI exposed the internal database → field editor → saved view → dashboard-block assembly sequence. This contradicted the intended Notion-style experience even though the underlying domain and exports were correct.

Tasks:

- Make the single workspace dashboard the default and only routine landing surface.
- Automatically create missing default views and place every active database on the primary dashboard.
- Create new tables directly on the page without a manual saved-view/dashboard step.
- Edit table names, column names, cells, new rows, and new columns in place.
- Keep filtering per table and place report/Excel/Outlook actions in one compact page toolbar.
- Retain the existing database/view/dashboard model behind the interaction projection.
- Add API coverage for idempotent multi-database workspace assembly and database renaming.

Exit criteria:

- Two differently shaped tables are visible and editable together immediately after opening the app.
- A user can create a table, add columns, add a row, rename a column, and filter without leaving the workspace page.
- Existing saved data and exports continue to use the shared view/report pipeline.

## Milestone order

1. `M0 — Product direction`: Phase 0A.
2. `M1 — Structured data`: Phases 0–2.
3. `M2 — Usable dashboard`: Phase 3.
4. `M3 — Report pipeline`: Phases 4–5.
5. `M4 — Outlook workflow`: Phase 6.
6. `M5 — Personal release`: Phase 7.
