# Somnia - Phase 0 prototype

Runs in the browser, no backend. Build: `npm i && node prepare-assets.mjs && cp ../docs/logo.svg public/ && node build.mjs`, then serve `dist/` (any static server).

What works (all tested headless):
- Canvas in a sandboxed iframe (no scripts run on the design canvas), real browser rendering
- Select (click, Layers, breadcrumbs), hover outline, margin/padding overlay, size label
- In-place text editing (double-click or Enter), Esc cancels
- Properties panel: tag, id, classes, link/image attributes, display + flex/grid, size, spacing, typography, color, fill, radius, border, opacity, shadow
- Breakpoints Desktop 1280 / Tablet 820 / Mobile 390. Editing at Tablet/Mobile writes `@media` overrides (class `sm-xxxx` + `<style id="somnia-responsive">`), Desktop writes inline styles
- Insert blocks by drag (with drop indicator) or click; move selected element by dragging its label; reorder in Layers by drag; Alt+Up/Down; duplicate; delete
- Code view (CodeMirror 6, HTML/CSS/JS) and Split view, bidirectional sync (code edit reparses the model, canvas edit reserializes the file)
- One shared undo/redo history for canvas and code
- Multi-file project (Files tab), page switching, new/delete file
- Open a real folder (File System Access API, Chromium), Ctrl/Cmd+S writes back. tested headless with a simulated folder
- Preview in a new tab (CSS/JS inlined), Export as ZIP, command palette (Ctrl/Cmd+K)

Known limits: canvas edits reformat the whole file (code edits do not); desktop edits are inline styles, no class-based design system yet; English UI only; no AI (Oneiroi) yet.
