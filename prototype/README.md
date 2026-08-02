# Interactive Prototype

This zero-dependency prototype validates product direction before production initialization. It uses in-memory demonstration data and deliberately does not implement persistence, real Outlook automation, or real `.xlsx` generation.

## Run locally

From this directory:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173/`.

## Review focus

- Multiple independently shaped databases on one dashboard.
- Per-database saved-view concept, status/owner filters, and block ordering.
- Database creation and field configuration flow.
- Static classic Outlook report direction.
- Single-sheet Excel presentation layout using a 60-column base grid.

## Prototype-only behavior

- Changes remain in memory and reset on refresh.
- “Create Outlook draft” and “Generate Excel” show intended behavior but do not call external applications.
- New records contain placeholder values rather than opening the future full record editor.
