# Project Status

Last updated: 2026-08-04

## Current state

- Phase: Phases 0 through 5 are implementation-complete; Phase 6 Outlook implementation is complete pending target-Windows classic Outlook verification. Windows desktop Excel verification also remains manual.
- Implementation: the local TypeScript/SQLite application now supports independent dynamic databases, typed saved views and filters, vertically composed dashboards, an escaped canonical report model, static HTML preview, explicit completed-status semantics, report display options, both Excel downloads, Outlook HTML/clipboard fallbacks, and a Windows classic Outlook draft bridge.
- Repository: Git repository on `main` with the TypeScript workspace and accepted prototype committed; `main` tracks `origin/main`.
- GitHub: private repository `l1zheng/project-manager-dashboard`; `main` tracks `origin/main`.
- Target user: one person.
- Target platform: Windows with classic Outlook.
- Deployment: local web application with SQLite.

## Confirmed decisions

- Independent custom databases retain their own schemas and terminology.
- Multiple saved database views are displayed together on one dashboard.
- View filters and layout drive all exports.
- Outlook integration creates and displays a draft; it never sends.
- Classic Outlook local automation is the primary integration, with rich-copy and HTML fallbacks.
- Excel provides both editable multi-sheet and presentation single-sheet modes.
- Presentation Excel uses a fine base grid and calculated merged spans.
- The Phase 0A dashboard structure, database configuration flow, independent filtering, and Outlook/Excel preview direction are accepted as the production interaction baseline.
- Model use follows a three-tier routing agreement; the assistant proactively recommends switching before tasks that materially benefit from a different tier.
- Persistence targets Node.js 24 LTS with stable Drizzle ORM and `better-sqlite3`; built-in `node:sqlite` is deferred until stable in both the target runtime and Drizzle adapter.
- Record values use versioned JSON keyed by stable field ID; field, option, and view semantics use stable IDs so labels can change without rewriting data.
- Drizzle-generated SQL migrations are committed and embedded. Pending migrations and destructive imports require a verified online backup; `drizzle-kit push` is forbidden for user databases.
- Completion is configured explicitly on at most one status field per database using stable completed option IDs; status labels are never guessed.

## Active task

`P6-03`: Verify Outlook signature retention and rendering on the target Windows classic Outlook installation.

## Next tasks

1. `P6-03` — Verify the PowerShell/COM bridge and configured Outlook signature on the target Windows classic Outlook installation.
2. Open both generated Excel files in desktop Excel on the target Windows machine and run [the Windows verification checklist](WINDOWS_VERIFICATION.md).
3. Start Phase 7: manual workspace backup and restore, automatic backup retention, and Windows packaging.

## Risks and validation items

| Item | Risk | Planned validation |
| --- | --- | --- |
| Classic Outlook HTML rendering | Browser-perfect CSS will not survive Outlook rendering. | Test conservative table/inline-style templates on real classic Outlook during Phase 6. |
| Outlook COM availability | Corporate policy may restrict PowerShell or automation. | Add availability detection and validate on the target PC before Phase 6 is considered complete. |
| Excel merged layout | Rounding or extreme field counts may create unusable spans. | Pure layout tests plus golden workbooks during Phase 5. |
| Dynamic filters | JSON-backed records may become slow at higher volumes. | Benchmark representative data before optimizing into SQLite JSON queries. |
| Packaging | A raw Node installation may be undesirable on the work PC. | Evaluate bundled Windows distribution in Phase 7. |
| Native SQLite driver | `better-sqlite3` must ship the correct binary on the target Windows/Node version. | Validate clean Node 24 LTS installation and persistence tests in P0-03, then repeat for the release package. |

## Verification log

- 2026-08-04: Completed P6-02. Added a canonical Outlook renderer (escaped table/inline-style HTML fragment, UTF-8 full HTML, plain text, and normalized subject), `创建 Outlook 草稿`, `复制邮件内容`, and `下载 Outlook HTML` dashboard actions. Added a Windows-only PowerShell/COM adapter packaged alongside the API: it probes Outlook registration, passes report data only through a bounded temporary JSON file, uses `shell: false`, displays a new mail inspector before inserting the report before the initialized signature, and maps timeout/policy/platform failures to fallbacks. Tests verify escaping, text fallback, subject normalization, JSON-not-command invocation, output limits, no-send/no-recipient/no-save script restrictions, API header guard, and fake-adapter draft flow. On this macOS machine, an isolated end-to-end run verified a valid UTF-8 HTML download (200) and the expected 501 `platform_unsupported` draft response with clipboard/HTML fallbacks. Actual COM and signature behavior remains a Windows classic Outlook acceptance gate.

- 2026-08-04: Completed P6-01 and accepted ADR-0003. The Windows bridge will pass a bounded server-generated report fragment through a temporary UTF-8 JSON file to a committed PowerShell script invoked without a shell or execution-policy bypass. Draft creation displays a new HTML mail item first, then inserts the report after the existing body tag to preserve Outlook's initialized signature. The API accepts no recipients, attachments, arbitrary HTML, commands, or script paths; the shipped script contains no Save/Send path. Availability and automation failures map to rich-copy and HTML-download fallbacks, with final COM/signature behavior retained as a Windows acceptance gate.

- 2026-08-04: Completed P5-03 and the Phase 5 implementation. Added the presentation workbook adapter plus `GET /api/dashboards/:id/export/presentation.xlsx` and the dashboard’s `下载展示版 Excel` action. One landscape report sheet uses a 60-column base grid: title/period/module headings span the report; each module independently receives merged header and data spans from the tested allocator. It applies wrapping, row-height profiles, borders, print area, fit-to-width setup, typed date/number cells, status highlighting, and literal-text protection. Workbook reload tests verify one sheet, 60 columns, merged spans, print setup, typed dates, and formula protection; API tests verify the download payload. Independent rendering visually confirmed differently shaped 需求跟踪 and 关键风险 sections on one sheet, and an end-to-end local response downloaded as a valid Excel 2007+ file. Desktop Excel on the target Windows machine remains a manual release check.

- 2026-08-04: Completed P5-02. Added ExcelJS-based editable workbook generation plus `GET /api/dashboards/:id/export/editable.xlsx` and the dashboard’s `下载可编辑 Excel` action. Each included report section becomes an independent unmerged worksheet with frozen headers, filters, saved/fallback widths, wrapping, typed numbers/dates, and formula-injection/XML-control protection. Export/API tests load the generated workbook and verify sheets, date types, auto-filters, frozen rows, no merges, and ZIP payload headers. An independent workbook render verified Chinese requirement/risk sheets and corrected a timezone regression so `2026-08-14` remains that date in the `.xlsx`; browser verification confirmed the button triggers the download endpoint.

- 2026-08-03: Completed P5-01. Added a pure deterministic presentation-grid allocator that maps independently shaped report sections onto a 60-column logical grid. Allocation combines field-type profiles, CJK-aware heading/content samples, saved-view width preferences, readable baselines, and stable largest-remainder rounding. Dense schemas compress to a hard one-column minimum; more than 60 visible fields fail explicitly. Tests verify exact 60-column coverage, contiguous merge boundaries, text-vs-status sizing, width preferences, deterministic ties, compression, duplicate IDs, and impossible grids. Verified `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check`.

- 2026-08-03: Completed P4-04 and Phase 4. Added explicit completion configuration to one status field per database using stable completed option IDs, browser controls to mark one or more options as completed, and the report-level `包含已完成事项` option. Reports can exclude completed rows even when the status field is hidden; the default remains inclusive for backward compatibility. Added domain, export, and API coverage for `open`/`closed`/`suspended`, fixed the workspace test command so report tests actually run, corrected demo-workspace selection, and synchronized dashboard blocks after record/view changes. Browser-verified the checked `已关闭` marker, exclusion of a closed requirement from static preview, and immediate dashboard refresh. Verified `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check` before the final documentation pass.

- 2026-08-03: High-model review corrected P4-01 before downstream adapters were built: sequence columns now use record metadata, and select/multi-select/status option IDs resolve to business labels in the canonical model. Completed P4-02/P4-03 with a static sandboxed browser preview, report title/period, compact/comfortable density, empty-section policy, status highlighting, conservative inline HTML styles, and API integration coverage. Browser-verified `序号 1`, `状态 已完成`, Chinese description, absence of editing controls inside the preview, and custom title/period. Also corrected dashboard read-only cells to display sequence values and option labels. Verified `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check`.
- 2026-08-03: Completed P4-01. Added pure versioned report-model construction from dashboard view payloads and a conservative static HTML renderer with user-content escaping. The model preserves block order, titles, descriptions, export inclusion, saved field order/widths, and already evaluated rows; adapters do not query or re-filter storage. Added export unit coverage for projection and HTML escaping. Verified `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check`.
- 2026-08-03: Completed P3-03 and Phase 3. Added per-block title overrides, collapse, export inclusion, and upward reorder controls, all persisted through the dashboard-block API. Verified `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check`.
- 2026-08-03: Completed P3-01 and P3-02. Added validated dashboard/dashboard-block persistence API and browser controls to create a dashboard, add a saved view as a block, and render blocks vertically with their independently configured fields and filtered rows. Verified `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check`.
- 2026-08-03: Completed P2-06 and Phase 2. Added archived/restore API endpoints for views plus a browser archive action with the existing immediate undo notice. Verified `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check`.
- 2026-08-03: Completed P2-05. Added browser controls to rename and duplicate the active view without changing its source database, plus a recursive nested filter editor that stores the existing typed `AND`/`OR` expression tree. It uses the shared field-aware operators and sends the exact structured expression to the saved-view API. Verified `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check`.
- 2026-08-03: Completed P2-04. Added per-view visible-column selection, column order controls, persisted widths, and primary sort direction in the browser. Browser-verified in an isolated workspace: hid `事项`, sorted by `优先级` ascending, saved, and confirmed that only the `优先级` column rendered in `1, 2` order both before and after a page reload. Verified `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check`.
- 2026-08-03: Completed P2-03. Added browser saved-view creation/selection and a field-type-aware single-condition filter editor (text, number, date, select/status, multi-select, checkbox, and sequence operators). The active view refreshes after record mutations, and restoring a saved simple condition repopulates its controls. Browser-verified saved-view creation and a text filter that reduced results from one row to zero in an isolated workspace; verified `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check` after the completed implementation.
- 2026-08-03: Completed P2-02. Added versioned saved-view configuration (visible fields, per-view widths, filters, typed sorting, archived-record policy), deterministic view evaluation, and API endpoints to create/list/read/update views. Integration coverage verifies that a filtered, sorted saved view returns its evaluated rows. Verified `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check`.
- 2026-08-03: Completed P2-01 and accepted ADR-0002. Added a bounded nested `AND`/`OR` filter expression, field-type-specific operators, stable field/option ID validation, explicit empty semantics, locale-independent text matching, inclusive date ranges, and a pure shared record evaluator. Tests cover nested groups, text, number, date, select, multi-select, checkbox, sequence, invalid operators/fields/options/groups/ranges, and no-filter behavior. Verified `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check`.
- 2026-08-03: Completed P1-04. Added archive/restore API operations for databases, fields, and records; active views exclude archived data; browser controls archive each resource and provide an immediate undo action. Verified `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check`.
- 2026-08-03: Completed P1-03. Added validated record updates through `PATCH /api/records/:recordId`, an editable browser table, new-record rows, and controls for all first-release field types including selects, multi-selects, dates, checkboxes, long text, and automatic sequence display. Browser-verified in isolated data: created a database/field, added `支持单点登录`, updated it to `支持统一认证`, and confirmed the saved value reloaded. Verified `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check`.
- 2026-08-03: Completed P1-02. Replaced the static web shell with a SQLite-backed database sidebar, database creation form, per-database schema editor covering all first-release field types, option configuration for select/multi-select/status fields, stable-ID field renaming, and read-only table preview. Browser-verified in an isolated temporary database: created independent `需求跟踪` and `关键风险` databases, configured their different field terms, renamed a field, saved a status field with options, switched between databases, and confirmed new field forms reset to the safe default text type. Verified web lint/build and formatting before the final full-suite check.
- 2026-08-03: Completed P1-01. Added shared validation for field configuration and typed record values; local API operations for creating/listing databases, adding/updating fields, creating records, and reading database detail; default workspace initialization; transactional per-database sequence allocation; and API integration coverage proving an invalid status is rejected and a field rename preserves existing Chinese record values by stable field ID. Verified `pnpm test` (7 API + 3 domain tests), `pnpm lint`, `pnpm build`, `pnpm format:check`, and `git diff --check`.
- 2026-08-03: Completed P0-03. Added stable `better-sqlite3`/Drizzle dependencies, platform data paths, all nine initial persistent tables, generated and checked the first SQL migration, verified online pre-migration backups, SQLite-backed health reporting, an idempotent Chinese demo workspace command, and the Windows Node 24 LTS verification checklist. Verified `pnpm test` (6 API + 2 domain tests), `pnpm lint`, `pnpm build`, `pnpm format:check`, `drizzle-kit check`, repeated demo seeding in an isolated directory, and a real compiled-API `/api/health` response. Windows target-machine validation remains manual.
- 2026-08-03: Completed P0-02 architecture decision in `docs/decisions/0001-local-sqlite-persistence.md`. Selected Node.js 24 LTS, stable Drizzle with `better-sqlite3`, versioned field-ID-keyed JSON records, restrictive archive-first relationships, generated migrations, verified online pre-migration backups, and platform-specific local data directories.
- 2026-08-03: Completed P0-01. Created the pnpm TypeScript workspace, React/Vite web app, loopback-only Fastify health API, shared domain/export packages, linting, formatting, and unit tests. Verified `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm build`, direct API health, and Vite proxy health.
- 2026-08-03: Added the local three-tier model-routing agreement covering proactive upgrades, downgrades, and task examples.
- 2026-08-03: User reviewed and accepted the Phase 0A interactive prototype without requested changes; its interaction direction is frozen as the production baseline.
- 2026-08-02: Built the Phase 0A zero-dependency interactive web prototype with independent database schemas, per-block filtering, field configuration, block ordering, and Outlook/Excel report previews; verified JavaScript syntax and local HTTP availability.
- 2026-08-02: Created the private GitHub repository `l1zheng/project-manager-dashboard` and pushed the initial `main` branch.
- 2026-08-02: Installed GitHub CLI, authenticated the `l1zheng` account, and selected a repository-local Git identity using the account's GitHub privacy email.
- 2026-08-02: Initialized the local Git repository with `main` as the default branch and added baseline ignores for Node build output, local configuration, SQLite data, and backups.
- 2026-08-02: Product requirements, initial architecture, implementation phases, and agent handoff rules written to the repository.
- 2026-08-02: Microsoft Outlook Object Model feasibility checked against Microsoft documentation: classic Outlook supports creating a `MailItem`, assigning `HTMLBody`, and displaying the draft.

## Blockers

None for Phase 0.
