# Slides shell panels

Slides uses the studio shell panel and generic inspector contract. The pure definitions in `phase1/src/lib/slides/panelDefinitions.ts` are shared by the studio manifest and `components/slides/registerShell.ts`. No UI module is imported by the manifest.

## Panels and sections

- `slides.overview`: slide navigation, thumbnails, text/number search and a compact list. Filter and display mode use `usePanelState`.
- `slides.outline`: deck-wide editable text runs, searchable by text/slide number. Selecting a run navigates to its slide before selecting it.
- `shell.inspector`: text, presentation and compatibility sections. Presentation and compatibility start collapsed; the generic inspector persists collapse state.
- `slides.inspector.text`: edits a selected run with a resettable local draft, UTF-8 byte counter, 16 KiB and XML-character validation, undo/redo and copy export. Unsupported slides show extracted preview text without edit controls.
- `slides.inspector.deck`: actual slide count, dimensions, aspect ratio, canonical text-run/word counts, working-copy bytes and dirty state.
- `slides.inspector.diagnostics`: producer, package entries, expanded bytes, renderer memory and the existing engine's compatibility warnings. These are diagnostics, not a rendering-fidelity guarantee.

## Commands and identity

`registerSlidesCommands()` also registers `slides.loadThumbnails`, `slides.selectText` and `slides.editText`. Panels use the shared dispatcher, including validation, activity records and interactive-origin restrictions. Existing navigation, history and copy export commands keep their original session behavior.

Edits carry source URL, slide index, run index and the previously shown text. The command checks these against the active session before mutation. The byte snapshot history stays in the Slides session. No operation mutates the original source file. Browser copy downloads retain the existing dirty flag.

Selection is ephemeral and bound to source identity, never persisted as a stale blob URL. The canvas claims `StudioContext` and publishes current slide/text-run selection, dirty/read-only state, busy state and text-editing availability. A stale claim cannot update another canvas's context.

The inspector does not imply unsupported capabilities: shape transforms, layouts, master slides, animation editing and speaker-note editing are not provided by this engine package.

## Validation

- `npx tsx --import ./scripts/test-css-register.mjs --test src/components/slides/shellPanels.test.tsx src/lib/slides/*.test.ts src/lib/shell/*.test.ts src/lib/i18n*.test.ts`
- `npm run check:ui-commands`, `npm run check:layers`, `npm run check:commands`, `npx tsc --noEmit`
- `node scripts/slides-panel-preview.mjs`: isolated visual harness with a renderer double because the local WASM artifact is not checked in. OOXML parsing, text editing, undo and session navigation use the real implementation. Screenshots go to `/downloads`. This is test code, not app startup.

The isolated harness checks light/dark readability and generic inspector collapse/expand. It cannot establish real WASM preview fidelity, desktop save dialogs or native file access. Verify those in the integrated application once the engine artifact is built.
