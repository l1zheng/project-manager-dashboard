# ADR-0002: Shared typed filter semantics

Status: accepted on 2026-08-03

## Decision

The browser, report preview, Outlook HTML, and both Excel exports must consume one pure domain evaluator. A versioned saved-view configuration stores either `null` (no filter) or an expression containing condition nodes and nested `and`/`or` groups.

Conditions reference stable field IDs. Select operands reference stable option IDs. Labels are never persisted in filter predicates, so renaming a field or option cannot change the result.

The evaluator supports field-appropriate operators:

- text/person/URL: equality, contains, negated forms, and empty checks;
- number/sequence: equality and ordered comparisons;
- date: equality, before/after, inclusive bounds, and inclusive ranges;
- single select/status: equality and membership by option ID;
- multi-select: contains any/all/none by option ID;
- checkbox: checked/not checked.

Empty means a missing value, empty string, or empty array. A missing checkbox is treated as not checked. Text `contains` is case-insensitive using locale-independent Unicode lowercase conversion. Date strings compare lexically because persistence already requires `YYYY-MM-DD`.

An expression group must contain at least one child. Parsing rejects unknown/archived field IDs, operators incompatible with the field type, unknown option IDs, duplicate list operands, more than 200 nodes, or nesting deeper than eight levels.

## Consequences

- All output formats receive identical record membership for the same view.
- Renames remain metadata-only.
- `null` is the only representation for no filter, avoiding ambiguous empty-group behavior.
- SQLite predicate pushdown is deferred; any future optimization must prove equivalence against this evaluator.
