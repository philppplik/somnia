# Design Studio core

Design is an artboard/layout workspace. Vector Studio owns SVG import and path editing; existing PDF tools own PDF editing. Design opens `.somdesign`, a local JSON project with `format: "somnia-design"` and `version: 1`. It exports all artboards as native JSON or the active artboard as safe standalone SVG.

## Model and validation

`src/lib/design/model.ts` exports `createDesignDocument`, `createArtboard`, `createNode`, `parseDesignDocument(source: string)`, `serializeDesignDocument(document)` and `exportArtboardSVG(artboard)`.

Artboards have names, dimensions, background colors and ordered rectangle/text layers. Layers have positions, dimensions, rotation, opacity, fill/stroke, stroke width, radius, text/font size, hidden and locked flags. Import reconstructs a whitelist, rejects malformed values and duplicate IDs, bounds file size (5 MB), artboard count (100) and layers per artboard (1,000). SVG text is escaped and no external references, scripts or arbitrary attributes are emitted. Hidden layers are omitted from SVG; lock/hidden metadata survives in native JSON.

`session.ts` exports `startDesign()`, `loadDesign(document, dirty?)`, `getDesignState()`, `editDesign(callback)`, `undoDesign()`, `redoDesign()`, `selectDesignNode(id | null, additive?)`, `selectArtboard(id)` and `setDesignTool(tool)`.

Each document edit validates the whole result before publishing one history transaction. Pointer previews do not alter the document until release. Inspector patch batches and multi-selection alignment are single undo transactions. History is limited to 100 snapshots. Downloads do not claim that a file was saved: dirty remains true. Replacing a dirty design asks before discarding it. Browser navigation receives a beforeunload guard.

## UI

The shared starter opens a native project or starts blank without a picker. The vertical toolbox uses V/H/F/R/T: selection, scroll hand, add artboard, place rectangle and place text. The canvas supports pointer movement, resize, zoom and keyboard undo/delete. Rotated layers use inspector Width/Height for resizing. The right panel supplies artboard settings, layered selection (Ctrl/Cmd/Shift), rename, hide/lock, reorder, duplicate/delete, validated layout/text/appearance fields, align and distribute. Text layout is simple multiline, without auto-wrap or rich text. SVG text baseline is an approximation of browser font metrics. Preview strokes use an inset CSS approximation; SVG uses actual vector strokes.

## Shared integration patch

The separate wiring patch imports `design.ts` from `lib/studios/index.ts` and adds `design.canvas` / `design.inspector` to `components/studios/hosts.tsx`. The manifest registers `registerBlankProjectFactory('design', startDesign)` using the shared blank API. The studio icon is `LayoutTemplate`; the shared pill glyph map must support that name (otherwise its current fallback is Code).

Core files remain untouched. Builder must add these seams before claiming desktop-wide integration:

- Generic open/drop: claim `.somdesign`; read as bounded UTF-8 text, call `parseDesignDocument`, ask before replacing dirty state, then `loadDesign(doc)` and `requestStudio('design')`. The Studio Open button already performs native JSON import. Do not route `.svg` or `.pdf` to Design.
- Save and export: Ctrl/Cmd+S and Project Save when Design is active should serialize `getDesignState().document` to an explicitly chosen `.somdesign` destination. A confirmed write should clear the design dirty flag, not the Code document dirty flag. Existing downloads do not clear dirty. Expose a core-owned event `design:saved` only after the actual write succeeds; call a new adapter `markDesignSaved()` then. Failed writes must retain dirty and show an error.
- Native close/reset/replace: include `getDesignState().dirty` in the shared dirty check and show Save / Discard / Cancel. Save must await the verified write; Cancel leaves the session intact. Discard should call `clearDesign()` only after user choice. Studio switching is not discard: keep Design session in memory.
- Persistence/container: `.somnia` project/draft storage must serialize the Design document separately from Code buffers if session restoration is desired. This patch does not imply persistence.
- Global command dispatch: the shared undo/redo controls should delegate to `undoDesign()` / `redoDesign()` while Design is active. In-canvas shortcuts and buttons work independently.

No event names above are existing implemented events; they are proposed integration seams for the builder. The final patch exports `markDesignSaved()` and `clearDesign()` as callable adapters as well, so the builder does not need event dispatch.

## QA

Model/session + panel tests: `npx tsx --test src/lib/design/*.test.ts src/components/design/design.test.tsx`.

Browser IDs: `design-canvas`, `design-artboard`, `design-layer-<id>`, `design-create-blank`, `design-open`, `design-add-rectangle`, `design-add-text`, `design-undo`, `design-redo`, `design-export-project`, `design-export-svg`, `design-import-input`. Panel IDs include `design-layer-row`, `design-layer-name-input`, `design-tool-frame`, `design-field-x`, `design-field-text`, `design-field-opacity`, `design-align-left`. Numeric/hex fields commit on Enter/blur; text commits on blur. Panel names are translated; IDs are stable.

The isolated real-browser check covers blank creation, rectangle/text editing, Unicode text, undo/redo, project export/reopen, SVG export, pointer movement, opacity, invalid input alerts, multi-select align, adding artboards and placing shapes. Full-app validation requires generated WASM bridges. The base checkout lacks `slides-engine/pkg/somnia_slides.js`, so full tsc is not green in this isolated checkout.
