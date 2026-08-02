# Project Status

Last updated: 2026-08-03

## Current state

- Phase: Phase 1 dynamic database foundation is complete; Phase 0 engineering foundation and Phase 0A prototype are complete.
- Implementation: pnpm TypeScript workspace, React/Vite web schema editor, Fastify API, shared domain/export packages, version-controlled SQLite schema/migration, online pre-migration backup gate, demo data command, validated database/field/record API operations, tests, linting, and formatting are in place.
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

## Active task

`P2-01`: Design the typed filter-expression tree and shared evaluator.

## Next tasks

1. `P2-01` — Design the typed filter-expression tree and shared evaluator.
2. Add the first saved view definition after the evaluator is accepted.
3. Run [the Windows verification checklist](WINDOWS_VERIFICATION.md) on the target Node 24 LTS machine before declaring native-driver support complete.

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
