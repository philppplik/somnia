# Design studio shell

The Design studio runs on the studio shell (panel API, `docs/concepts/studio-shell.md` section 9). The manifest is `phase1/src/lib/studios/design.ts` (pure data). The hosts are `phase1/src/components/design/DesignShellPanels.tsx`, registered in `registerShell.ts`.

## Rails

Left rail, in default order: Files, Layers, Artboards, Colours, then (off the rail by default, in the overflow menu) Search and Versions. After them come the canvas tools: Select, Hand, Rectangle, Text, Artboard. Tool items appear only while a design is open (`when: services.ready`). All items can be reordered, pinned, moved to the overflow menu, hidden and reset per studio (right-click an icon, or use the overflow button).

Right rail: Properties (the generic inspector).

## Panels

- **Layers**: the layer outline of the active artboard (select, rename, show/hide, lock, reorder, duplicate, delete).
- **Artboards**: list with size and layer count, add (blank 960 x 640 or from a size preset), duplicate, delete (the last artboard stays), move up/down, rename (double-click or F2).
- **Colours**: colours used on the active artboard (background, fills, visible strokes), most used first. A swatch applies to the selection's fill or stroke, or to the artboard background. Custom colour picker and "no colour".

## Inspector sections

Shown by `when`, all need an open design: Selection (position, size, rotation, opacity, fill, stroke, radius, text; align and distribute for several layers; an empty hint without a selection), Artboard (name, switch, width, height, size preset, swap width and height, background) and Project (name, counts, exports; collapsed by default). Arrange (stacking order, nudge with a step, show/hide, lock) additionally needs a selection.

## Context

The canvas claims the shell context while mounted: `selection` (layer ids of the active artboard), `activeTool`, `document.dirty`, `data.{artboardId,artboards,layers,boardLayers,zoom}` and `services.{ready,layers,align,distribute,multiBoard,canUndo,canRedo}`.

## Commands

`phase1/src/lib/design/commands.ts` (`registerDesignCommands`, registered while the canvas is mounted). All new commands are `ui` level, so the agent and MCP cannot run them. Every command that edits the document is one undo step.

- Tools: `design.tool.select|hand|rectangle|text|frame`
- Artboards: `design.artboard.add {preset?, name?, width?, height?}`, `duplicate`, `delete`, `rename {name}`, `select {index|id}`, `next`, `previous`, `moveUp`, `moveDown`, `resize {width,height}`, `preset {preset}`, `rotate`
- Colour: `design.color.apply {target: fill|stroke|background, color: #rrggbb|null}`
- View: `design.zoomIn`, `zoomOut`, `zoomReset`, `zoomFit`, `zoomSet {zoom}`
- Selection and layers: `design.selectAll`, `deselect`, `layer.front|forward|backward|back`, `layer.toggleVisible`, `layer.toggleLocked`, `nudge {dx,dy}`
- Project: `design.rename {name}`

Pure logic (presets, palette, stacking, nudge, artboard transforms) lives in `lib/design/artboards.ts`. View state (zoom, measured viewport) lives in `lib/design/view.ts` and is not part of the document.

Canvas keyboard: arrow keys nudge the selection by 1, Shift+arrow by 10 (locked layers stay).

Presets (CSS px): Social post 1080x1080, Story 1080x1920, Slide 1920x1080, Desktop 1440x900, Tablet 820x1180, Mobile 390x844, A4 794x1123, US Letter 816x1056.

## Menus

The manifest declares `shellV2.menus` for Project, Edit, View, Insert and Tools. The grouping table (`menuGrouping.ts`) folds the Edit entries into Design > Layers / Artboards and View into Design.

## Tests

- `src/lib/design/artboards.test.ts`, `src/lib/design/shellCommands.test.ts`, `src/lib/shell/designShell.test.ts`, `src/components/design/shellPanels.test.tsx` (part of `npm run test:core`).
- `tests/design-studio.spec.ts` and `tests/design-studio-qa.spec.ts` (legacy, 13 tests) pass against the shell layout.
- `tests/design-shell.spec.ts` (Playwright, light and dark): rails, panels, inspector sections, rail customization, tool items, stacking.
- `npm run check:ui-commands` is in sync (`docs/ui-commands.json`).

## Screenshots

Light and dark, from the Playwright run against the web build: `img/design-shell-{light,dark}-layers-inspector.png`, `-artboards.png`, `-colors.png`.

## Not done / not verified

- Real Tauri window not checked, only the web build in Chrome.
- The legacy canvas toolbar (Open, New, Rectangle, Text, Undo, Redo, Zoom, Export) still exists next to the new panels. It stays because `tests/design-studio*.spec.ts` use it. Removing the duplicates is a separate decision.
- No status bar slot for zoom yet. The status bar still shows the code studio viewport controls.
- No PNG export, no grid or snapping, no groups.
