# Table editor (first cut)

Command palette (Insert): "Insert table (3 x 3, header row, caption)", Table: add row above/below, delete row, add column left/right, delete column, toggle header row, merge cell with right neighbour.

- Insert creates `<table>` with `<caption>`, `<thead>` with `<th scope="col">` and a `<tbody>`; the caption is a placeholder to edit (accessibility: tables should be named).
- Row/column/merge actions work from the selected row or cell (Layers, canvas, breadcrumbs). Each action is one undoable transaction (new table inserted, old removed).
- Pure text logic in lib/tableOps.ts (unit-tested); selection wiring in lib/tableCommands.ts.
- Limits: tables with colspan/rowspan refuse row and column edits (merge only adds colspan); nested tables are refused; no rowspan merge; no drag-resize; selection is cleared after an action.
- Layer right-click menu on table, tr, td, th lists the same table actions; all layers get Indent and Outdent entries.
