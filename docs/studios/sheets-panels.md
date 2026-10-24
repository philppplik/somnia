# Sheets shell panels

The Sheets panel data lives in `phase1/src/lib/sheets/panels.ts`. Components live in `phase1/src/components/sheets/SheetsPanels.tsx`, registered through `registerStudioPanels` in the UI-owned `registerShell.ts`. The generic `shell.inspector` renders cell and formula sections; the workbook owns the engine and publishes its selection through the Sheets store and `StudioContext`.

- **Workbook**: worksheet filter, visible-sheet switching, go-to-cell navigation with scrolling, used-range dimensions, frozen panes, merge count, import warnings, undo/redo and export-copy commands. Hidden worksheets are listed but cannot be activated.
- **Range analysis**: bounded range reads (10,000 cells), normalized addresses, raw-number sum/average/min/max and counts for numeric, empty, non-empty, formula and error cells. Results identify their source range and become visibly stale when the workbook revision changes. A response from another worksheet cannot replace the current worksheet's results.
- **Cell inspector**: selected cell value/formula editor, cell type, worksheet, original number format and font. Apply writes through the existing workbook engine and its undo stack. Formatting information is read-only because the engine protocol does not expose style mutations.
- **Formula builder**: SUM, AVERAGE, MIN, MAX, COUNT and COUNTA over a validated local range. Applying replaces the selected cell. The UI blocks an aggregate whose target falls inside the source range. Function names use the engine's canonical identifiers.

Actions use `sheets.navigate`, `sheets.setCell` and `sheets.analyzeRange`, registered alongside the existing mount-time Sheets commands. Their payloads are schema-validated, all are interactive-only, and their controller expires when the workbook unmounts. Persisted panel state contains only filters, source ranges and the chosen aggregate function, never workbook contents or selection.

Five locale catalogues live in `panelI18n.ts`. Workbook import warnings remain engine-provided strings, as in the canvas. Export retains the existing new-file-only save route. No style mutation, workbook structure mutation, remote data fetch or external formula function is added.

## Verification

Unit tests cover range normalization and caps, aggregates, formula allowlisting, payload validation, controller ownership, origin restrictions, locale parity and server-rendered empty/mismatched/read-only states. The visual preview renders all four real React panels with a test controller. It checks layout, not WASM recalculation or native filesystem behavior. A real-workbook smoke test still requires built Sheets WASM artifacts.
