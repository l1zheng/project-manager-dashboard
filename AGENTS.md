# Project Manager Dashboard — Agent Guide

## Mission

Build a local-first project-management dashboard for a single user. The product combines Notion-style independent databases and saved views on one dashboard, then exports the current report to Excel or a well-formatted draft in Windows classic Outlook.

The application must not depend on Notion or another external SaaS service. The first supported production environment is Windows with classic Outlook installed.

## Read before making changes

Read these files at the beginning of every substantial task:

1. `docs/PRODUCT_REQUIREMENTS.md` — product scope and acceptance criteria.
2. `docs/ARCHITECTURE.md` — chosen technical direction and constraints.
3. `docs/IMPLEMENTATION_PLAN.md` — ordered delivery plan.
4. `docs/PROJECT_STATUS.md` — current phase, active tasks, decisions, and blockers.
5. `docs/MODEL_ROUTING.md` — model-tier routing and proactive switch protocol.

If implementation and documentation disagree, stop and resolve the inconsistency. Product requirements take precedence over implementation-plan wording; explicit user instructions take precedence over all repository documents.

## Fixed product decisions

- First release is for one person, not real-time multi-user collaboration.
- Primary deployment is a local application on Windows.
- The UI is a web interface served on loopback (`127.0.0.1`) and opened in a browser.
- Data is stored locally in SQLite.
- A “database” is a user-defined collection with its own schema, records, and saved views.
- Different databases may have completely different fields and business terminology.
- A dashboard embeds multiple independently configured database views.
- Filters, sorting, visible columns, column order, and widths belong to a saved view.
- Exports are static report renderings of views; interactive controls are never exported.
- Excel has two modes: editable data workbook and presentation workbook.
- Presentation Excel may merge cells; source data and editable exports must not.
- Outlook export creates and displays a draft. It must never send mail automatically.
- Windows classic Outlook integration uses the local Outlook Object Model where available, with copy-rich-text and HTML download fallbacks.

## Engineering rules

- Prefer TypeScript end to end.
- Keep domain logic independent from React components, Excel generation, and Outlook integration.
- Use stable IDs for databases, fields, records, views, dashboards, and blocks. User-facing names are mutable.
- Store record values by field ID, never by field name.
- Treat all rich text and generated HTML as untrusted input; escape content before rendering.
- Bind the local server to loopback only by default.
- Do not add cloud authentication, telemetry, or external storage without an explicit requirement.
- Do not implement automatic email sending in the first release.
- Add automated tests for filter evaluation, report layout, Excel cell spans, and export sanitization.

## Project maintenance

After material work:

1. Update `docs/PROJECT_STATUS.md` with completed work, verification, blockers, and the next concrete task.
2. Update `docs/IMPLEMENTATION_PLAN.md` when scope or sequencing changes.
3. Record lasting architecture decisions in `docs/ARCHITECTURE.md`.
4. Update `docs/PRODUCT_REQUIREMENTS.md` only when the product requirement itself changes.

Keep the status file concise. It is the handoff point for the next development session.

## Model routing

Follow `docs/MODEL_ROUTING.md`. Before a task that materially benefits from another tier, proactively recommend one of the project's three user-defined tiers:

- High model, high reasoning.
- Medium model, medium reasoning.
- Mini model, medium reasoning.

The user performs the actual switch. Prefer grouping similar work to reduce unnecessary tier changes.
