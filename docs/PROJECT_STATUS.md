# Project Status

Last updated: 2026-08-03

## Current state

- Phase: Phase 0 engineering foundation is in progress; Phase 0A prototype is accepted.
- Implementation: pnpm TypeScript workspace, React/Vite web app, Fastify API, shared domain/export packages, tests, linting, and formatting are in place. SQLite has not yet been added.
- Repository: Git repository initialized on the `main` branch; implementation source has not been initialized.
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

## Active task

`P0-02`: Finalize the local SQLite persistence model and migration strategy before creating permanent tables.

## Next tasks

1. `P0-02` — Finalize the local SQLite persistence model, migrations, and local data-directory adapter.
2. `P0-03` — Add an SQLite-backed health check, sample-data command, and a repeatable Windows verification checklist.
3. `P1-01` — Implement database, field, and record domain types using the accepted prototype as the UI reference.
4. `P1-02` — Build the database navigation and schema editor.

## Risks and validation items

| Item | Risk | Planned validation |
| --- | --- | --- |
| Classic Outlook HTML rendering | Browser-perfect CSS will not survive Outlook rendering. | Test conservative table/inline-style templates on real classic Outlook during Phase 6. |
| Outlook COM availability | Corporate policy may restrict PowerShell or automation. | Add availability detection and validate on the target PC before Phase 6 is considered complete. |
| Excel merged layout | Rounding or extreme field counts may create unusable spans. | Pure layout tests plus golden workbooks during Phase 5. |
| Dynamic filters | JSON-backed records may become slow at higher volumes. | Benchmark representative data before optimizing into SQLite JSON queries. |
| Packaging | A raw Node installation may be undesirable on the work PC. | Evaluate bundled Windows distribution in Phase 7. |

## Verification log

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
