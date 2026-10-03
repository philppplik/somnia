# Bento shell (design steering from Philipp, 2026-10-03)

Reference: dark calendar UI with rounded columns and a slightly darker background around them. Somnia keeps Light as default and gets the same layout in both themes.

- Tokens (tokens.css): `--shell-bg` (outer, darker than panels), `--radius-lg/md/sm` (22/14/10px), `--gap` (12px), `--card-shadow`.
- Layout (bento.css): titlebar, command bar, layers, canvas, inspector and status bar are separate rounded cards on `--shell-bg`. Resize handles are 12px gap columns with a thin accent grip on hover.
- No component logic changed. 25 Chromium tests pass; screenshots checked in light and dark.

## Stack
React 19 + Base UI (unstyled primitives) with shadcn-style component structure (src/components/ui, MIT license note in THIRD_PARTY_SHADCN_LICENSE.md) and plain CSS variables. Tailwind 4 is installed as a Vite plugin and imported in global.css, but the UI is styled with hand-written CSS, not Tailwind utility classes.

## Next
Custom window titlebar replacing the native Windows one (separate PR).

## Custom titlebar
Native Windows titlebar removed (`decorations: false` in tauri.conf.json). The app titlebar card is the drag region (`data-tauri-drag-region` on the bar and its non-interactive children); minimize, maximize/restore and close buttons live in `WindowControls.tsx` and render only inside Tauri. Close uses the window close request, so existing unsaved-changes handling still runs. Capability `core:window:allow-start-dragging` added.
Unverified on real Windows: drag, snap layouts (Win11 hover on maximize), resize from borders on a frameless window. Needs Philipp's test or a GUI smoke run. If resize edges misbehave, set `"resizable": true` is already default; a fallback is `decorations: true` plus overlay titlebar.

## Icon rails (Philipp mockup)
`src/components/IconRail.tsx`: narrow rails left (Layers/Assets/Components) and right (Design/Prototype/Code), always visible. Click opens the panel on that tab; click on the active icon collapses it. State stays in appStore (sidebarOpen, inspectorOpen, leftTab, rightTab). Still open: top bar with centered Splitview/Visual/Code toggle, status bar with Line/Col and language pill.

## Single top bar
Logo mask, menus (Project/Edit/View/Help), undo/redo, centered Visual/Split/Code toggle (aria labels unchanged), Commands, panel toggles, window controls. The separate command bar is gone. Project name moved to the status bar. Insert/Tools menus come once commands exist. Still open: Line/Col and language pill in the status bar.

## Preview without canvas frame
The preview iframe now fills the panel directly. The gray canvas stage, dot grid and padding are gone. The artboard label and the hint note were removed; the hint ("Double-click text to edit") and the breakpoint scope note ("Edits scoped to ≤ N px") live in the bottom row of the workspace, the zoom and viewport in the status bar.

## Linked HTML stays in the preview
`designFile` (appStore) is the HTML file the canvas, layers, inspector and structure commands work on. It follows `activeFile` while that is HTML; when a CSS/JS file is opened in the code pane it stays on the last HTML file (or the first one). Before, opening styles.css emptied the node tree and showed "Select an HTML file for design view", and in the old build the code pane stopped accepting clicks. Test: tests/linked-preview.spec.ts. Not reproduced on real Windows.

## Selection sync preview -> code
`SourceEditor` reacts to `selectedElementId`: when the selected node belongs to the file in the editor, its source range is selected, centered and the editor is focused (only if the code pane is visible). Works for clicks in the preview and in the layer tree. Test: tests/select-sync.spec.ts.

## Code color themes
Eight syntax themes (Classic, Ocean, Forest, GitHub, Solarized, Monokai, Dracula, Nord), each with a light and a dark variant as CSS tokens in global.css. Pick them in the code pane header or in Settings; persisted in localStorage. Only syntax colors change, the editor background follows the app theme. Editor is CodeMirror 6 (not Monaco). Test: tests/code-theme.spec.ts.
