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

## Status bar cursor and language
CodeMirror reports cursor position into appStore (cursorLine, cursorCol); the status bar shows "Line X, Col Y" while the code pane is visible plus a HTML/CSS/JS pill from the active file. Test: tests/statusbar-cursor.spec.ts.

## v7 UI cleanup (Philipp feedback)
- File tabs (`FileTabs.tsx`) replace the file dropdown in the code pane; middle click or x closes, right click offers Close tab / Close other tabs / Copy path. Left sidebar has a Files tab (`FilesPanel.tsx`, project tree) plus a rail icon. Open tabs live in appStore (`openFiles`, `openFileTab`, `closeFileTab`).
- Viewport switch (Desktop/Tablet/Mobile) and zoom moved into the status bar on the right. The old toolbar row above the preview and the info row below it are gone.
- Code theme is only in Settings now. Selection id, breakpoint note, preview file and history note live in the Problems panel (details list), not in the main UI.

## Shortcuts (v7)
Existing: Ctrl+S save, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo/redo, Ctrl+K palette, Ctrl+O open, Ctrl+B / Ctrl+J / Ctrl+Alt+I panels, Ctrl+1..3 view modes, Ctrl +/-/0 zoom. New: Ctrl+D duplicate selected element, Delete removes it, Ctrl+W closes the tab, Ctrl+Alt+Left/Right switch tabs. Key presses inside the preview iframe are forwarded to the app, so shortcuts also work right after clicking in the preview. Test: tests/shortcuts.spec.ts.

## Code editor assistance (v7)
CodeMirror 6 with `@codemirror/autocomplete` (HTML tags and attributes, CSS properties and values, JS keywords from the language packages), auto-closing brackets, `@codemirror/search` (Ctrl+F find, selection match highlighting). Popup styled with app tokens. Test: tests/autocomplete.spec.ts. No language server, so no semantic suggestions or lint yet (Problems panel stays empty).

## Insert and Tools menus
Top bar menus are Project, Edit, View, Insert, Tools, Help. Insert lists the HTML elements from the library (inserted into the selected container, same transaction and undo as the library panel). Tools holds Settings, Command palette, Toggle problems and Toggle theme. Test: tests/insert-menu.spec.ts.

## Flat top bar
The top bar runs edge to edge (no gap to the top, left and right window edges), is 44 px high, has no card background and only a hairline bottom border. Window drag region and controls unchanged.

## Rails toggles, tooltips, shell color
Sidebar and inspector toggles moved from the top bar to the top of their rails. Every Button gets `title` from its `aria-label` when none is set, so icon buttons show hover tooltips. Shell background token `--shell-bg` is #f8f9fb in light (was #e4e5ec) and #0a0b0e in dark (cool-tinted counterpart of the old #08080a).

## Tighter shell
Gap and radius tokens halved (Philipp): `--gap` 12px to 6px, `--r-lg` 22 to 11, `--r-md` 14 to 7, `--r-sm` 10 to 5 (tokens.css). Everything using the Tailwind shell spacing or radius tokens follows.

## Accessibility round 1
Global `:focus-visible` ring for buttons, tabs, menu items and inputs; `tests/a11y.spec.ts` fails if any visible control lacks an accessible name or keyboard focus has no outline. Still open: arrow-key navigation inside the icon rails and menus.
- Icon rails: Arrow Up/Down, Home, End move focus (toolbar pattern), `tests/rail-keys.spec.ts`.

## Code editor context menu
Right-click in the CodeMirror editor opens a fixed-position menu: Undo, Redo, Cut, Copy, Paste, Select all. Items are disabled when they do not apply (no selection, read-only). Escape or an outside click closes it and returns focus to the editor. If the browser blocks clipboard access the status bar says so. Test: `tests/code-context-menu.spec.ts`.

## v9 UI (2026-10-04)
- App frame radius is 2x the card radius; desktop window is transparent (untested on real Windows).
- Rails drive the sidebar/inspector tabs, no duplicate tab rows.
- Code settings: wrap long lines. Problems panel scrolls inside max 30vh.
- Scrollbars stay visible for accessibility, slim and quiet (Somnia tokens).
- Settings: Updates, About (MIT, third-party list). See ADR-004.

## Shortcuts and themes (2026-10-04)
- Settings > Shortcuts: change, clear, reset per command, overrides in localStorage (`somnia.shortcuts.v1`), conflict hint. Dreamweaver-style defaults: Ctrl+D duplicate, Ctrl+` code/design, F4 hide panels.
- Settings > Appearance > App theme: System (follows OS), Light, Dark, Cream, Dark Green, Midnight Blue. Palettes are token overrides in tokens.css (`data-palette`).
