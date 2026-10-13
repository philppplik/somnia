# Vector Studio shell

Vector uses the data-only `lib/studios/vector.ts` manifest and the shared panel stack,
rail customization and sectioned inspector. Components are registered once in
`components/vectorstudio/registerShell.ts`; bootstrap actions are kept in
`store/vectorBootstrap.ts`, not in the manifest.

## Panels and defaults

- Left: Files, Layers and Tools. Layers is open by default. It lists painted paths
  front to back, filters by name, selects with Shift for multi-selection, renames
  on blur/Enter and hides/restores paths. Hidden objects cannot be selected.
- Drawing tools: Select, Node and Pen are pinned by default. Rectangle, Ellipse,
  Line, Polygon and Star are in overflow. Every tool has a registered glyph.
  Rail reorder, hide, pin and reset are owned by the shared shell.
- Right: the generic inspector and Export. The inspector is open by default.
  Page size, selection transform and style, and selected-node editing are separate
  sections. Sections follow the live canvas context and retain their collapse state.
- Export downloads SVG or PNG at 1x, 2x or 4x. The PNG engine caps each side at
  8192 pixels. Appending SVG uses strict import and shows engine diagnostics.
  Downloads do not mark the project saved and do not replace native save behavior.

## Actions

Existing session specs remain unchanged. Panel callbacks use the command dispatcher,
not private parallel state. `vector.tool.<tool>` adds parameter-free rail actions;
`vector.rotateSelection {degrees}`, `vector.flipSelection {axis}`,
`vector.exportSvg {}` and `vector.exportPng {scale?}` are strict UI-only specs.
All immediate writes reject agent/MCP origins. Transform edits are atomic session
undo steps. Stroke widths are not scaled by rotation or reflection.

The original `vector.setTool`, selection, page, path style, arrangement, name,
visibility and node specs provide the other panel actions. Five localized vector
catalogues contain panel labels and command titles. The generated inventory awaits
`vectorCommandsReady` from the bootstrap module and includes all 40 vector specs.

The canvas owns and releases the shared context, reporting SVG identity/dirty state,
path ids, current tool and page size. Ready/node services gate rail tools and sections.
Legacy canvas interactions, toolbar and inspector remain intact. The old inspector
is a fallback; the v2 shell does not render it alongside the new sections.

## Verification

Run from `phase1`:

```sh
npm run inventory:ui-commands
npm run check:ui-commands
npm run check:layers
npm run check:commands
npx tsc --noEmit
npx tsx --test src/lib/vectorstudio/*.test.ts src/components/vectorstudio/tools/*.test.* src/lib/shell/*.test.ts src/lib/studios/*.test.ts
npx vite --host 127.0.0.1
node test/vector-shell-check.cjs
```

The isolated preview at `/test/vector-shell-preview.html` uses real VectorCanvas,
panels, section hosts, dispatcher and session. `?dark` changes theme; `?node` shows
node editing. It is not a screenshot of the full desktop shell. Browser checks cover
filter, bounds, duplicate/delete, hide/show, SVG download and node kind, and fail on
page errors. Unit tests cover shell validation, labels/locale parity, section gating,
rail overflow defaults, strict payloads, forbidden remote writes and undo behavior.

Windows/Tauri file dialogs and native menu behavior require desktop verification.
This checkout lacks generated `slides-engine/pkg/somnia_slides.js`; an unmodified
Slides worker import blocks full TypeScript checking until that engine is built.
