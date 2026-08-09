# V2 Notion-style Interaction Prototype

## Purpose

Validate the production interaction shell before reconnecting it to the user's SQLite workspace. The prototype is available only at `/prototype-v2`, uses in-memory sample data, and must never call mutation APIs.

The product goal is not to reproduce every Notion feature. It is to make independently shaped project tables feel as direct as Notion inline databases while retaining the existing Excel and Outlook renderers.

## Primary workflow

1. Open one page containing ordered table, text, and image modules.
2. Click a column header to open a property menu anchored beside that header.
3. Rename the column, change its type, or edit status options in that menu.
4. Resize a column by dragging its right edge; only that table changes.
5. Reorder a column by dragging its header.
6. Type in the bottom blank row; the row is created automatically without an extra `新增` action.
7. Filter each table from a menu anchored to that table's toolbar.
8. Open export from the page toolbar and preview the complete static report before choosing editable Excel, presentation Excel, or Outlook.
9. Add explanatory text or a local image on the same page without creating an artificial database.
10. Drag any module by its `⋮⋮` handle, or use its overflow menu to move it up or down; navigation and export follow the new order.

## Interaction rules

- Popovers use the clicked control as their anchor. They may flip to remain inside the viewport but must never jump to a global page corner.
- Only one transient popover is open at a time.
- Clicking outside or pressing `Escape` closes it.
- Unsaved property edits are discarded when the property popover closes.
- Column resizing provides a visible guide and has a practical minimum width.
- Column drag reordering has a visible dragged state and cannot affect another table.
- The blank row becomes a real local row after the first non-empty value is committed.
- Every visible overflow menu performs real actions; table and row menus must not remain inert placeholders.
- Deleting a property, record, or table requires an in-context confirmation before the local data is removed.
- The property menu exposes one multiline-capable `文本` type; it does not ask the user to choose between short and long text.
- Editable table cells are vertically centered by default; multiline narrative text stays horizontally left-aligned while short metadata can remain horizontally centered.
- The page-level `添加模块` menu creates a table, inline text, or a local image with an optional caption. These modules share one ordered page and one export preview.
- A text module has a large inline-editable section title above its multiline body. Sidebar navigation and static exports reuse that title; the export heading matches the table-section hierarchy.
- An image module has an optional inline title above the image. A non-empty title is reused in navigation and export; an empty title produces no static heading. The caption remains independently optional below the image.
- Every module kind has the same drag handle and before/after drop feedback. Overflow menus expose up/down commands, disabling directions that are unavailable at the page boundary.
- Page rendering, sidebar navigation, and export preview consume one canonical module order rather than maintaining separate lists.
- Prototype image bytes are kept only in memory. Production promotion must use validated local assets rather than retaining arbitrary paths or external URLs.
- Export presentation is field metadata, not a field-name heuristic: all body cells are vertically centered, short metadata may also be horizontally centered, and a business-title field may be emphasized independently of its mutable label.
- Empty tables remain visible in the export preview with their headers.
- Internal terms such as database, saved view, dashboard block, and field ID are absent from the routine UI.

## Prototype acceptance checklist

- [x] `需求跟踪` and `关键风险` appear together with different columns.
- [x] Clicking the `状态` header opens its property editor next to that header.
- [x] Outside click and `Escape` close property, filter, and export popovers.
- [x] Changing a property draft and dismissing it restores the prior value.
- [x] A column can be resized and the other table is unchanged.
- [x] A column can be reordered by dragging its header.
- [x] Typing in a blank row creates a row without clicking an add button.
- [x] Filtering one table does not filter the other.
- [x] Export preview contains both tables and no editing controls.
- [x] The Excel layout preview gives descriptive columns more width than status/sequence columns.
- [x] The table overflow menu can duplicate and delete a table.
- [x] The row overflow menu can duplicate and delete a record.
- [x] A property can be deleted from its anchored editor after explicit confirmation.
- [x] All body cells are vertically centered; sequence, identifier, date, person, and status cells are also horizontally centered while narrative fields remain left-aligned.
- [x] A field marked as the row title renders with stronger typography in the export preview.
- [x] Text cells accept multiline content and grow with wrapping while the property type remains simply `文本`.
- [x] Editable controls remain vertically centered when a neighboring narrative cell wraps to multiple lines.
- [x] Text and image modules can be created, edited, navigated, and deleted alongside tables.
- [x] The export preview preserves mixed module order and excludes all editing controls.
- [x] Table, text, and image modules expose the same drag and up/down ordering controls.
- [x] Reordering immediately updates the page, sidebar navigation, and export preview together.
- [x] A text module's large title is editable and appears as the same section level in sidebar navigation and export preview.
- [x] An image title appears in navigation and export only when supplied; a blank title emits no export heading.

The checklist above passed automated browser interaction and visual verification on 2026-08-09. Hands-on user acceptance remains the promotion gate.

## Non-goals

- No production data reads or writes.
- No SQLite migration.
- No real `.xlsx` download or Outlook automation from the prototype route.
- No persisted image asset storage; selected prototype images are discarded on reload.
- No relation, formula, calendar, board, or multi-user features.

## Promotion rule

The prototype is promoted only after hands-on user acceptance. Production must reuse the accepted table, header, popover, resize, reorder, blank-row, filter, and export-preview components or their extracted equivalents; it must not independently recreate the interaction from screenshots.
