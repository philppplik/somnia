# Documents shell panels

Documents hosts use the shared panel/inspector contract. The studio manifest is pure data; `components/documents/registerShell.ts` maps each declared host to its component.

## Available content

- **Pages** retains the existing lazy thumbnail panel.
- **Paragraphs** lists engine blocks in document order. It filters text, optionally excludes locked blocks and selects a paragraph through `documents.focusParagraph`. It is not a semantic heading outline: the current block API has no heading/style metadata. Tables and object paragraphs remain locked.
- **Find and replace** searches editable paragraphs with a literal Unicode-aware expression, supports case matching, caps results at 500 and selects matches using UTF-8 offsets. Replace changes one selected result and uses the engine undo history. Empty replacement deletes the result. Search results are checked against current text before selection or replacement.
- **Document inspector** shows engine page/word counts, Unicode character counts, paragraph/table counts, page dimensions, unsupported-part warnings, zoom, page navigation and undo/redo. Page dimensions convert the engine's points to millimetres. Saving remains the canvas's existing save-copy flow with its loss confirmation.
- **Paragraph inspector** follows the active paragraph selection. It shows character and selection counts, stages a paragraph draft and applies it explicitly. If the underlying paragraph changes while a draft is pending, Apply is disabled until Reload text. The command also verifies the original text before committing. Formatting stays with the engine; no font/style controls are invented.
- The foundation's **Edit text** and **Risks** sections are retained for the manifest to include.

## State and command boundaries

Filters, case matching and outline preferences use `usePanelState`. Document drafts and replacement text are session-only and are not stored in local storage. New actions are typed `ui` command specs in `lib/documents/panelCommands.ts`, registered only while DocumentsCanvas is mounted. Their guards require the claimed Documents context to match the current document and a live engine in ready state. Edits also honor read-only and busy state. Agent/MCP callers cannot fire these UI commands.

Pure definitions live in `lib/documents/panels.ts`: `DOCUMENTS_PANELS` (outline/find), `DOCUMENTS_INSPECTOR_SECTIONS` (document/selection) and `DOCUMENTS_PANEL_COMMANDS` (command IDs). The rail owner composes these with the shared Files/Versions panels, Pages and `shell.inspector`.

`registerDocumentPanelCommands` is registered in the UI command inventory as `documents-panels`; the generated inventory includes all ten new commands. Regenerate `docs/ui-commands.json` and `docs/ui-commands.md` after combining other studio work. All new labels have en/de/es/fr/pt-BR translations in `panelI18n.ts`.

## Validation

Run from `phase1`:

```sh
npx tsx --test src/lib/documents/*.test.ts src/components/documents/*.test.tsx
npm run check:ui-commands
npm run check:commands
npm run check:layers
npx tsc --noEmit
```

The focused suite covers literal searches and UTF-8 offsets, stale result/draft rejection, replacement/deletion with undo and redo, parameter/origin/read-only guards, locale and placeholder parity, manifest structure, empty states and server-rendered accessible panel content. Engine-dependent tests skip when generated WASM is absent. Light/dark isolated browser fixtures verify layout and filter/zoom/draft interaction, but do not replace native or real-engine end-to-end tests.

Run the isolated browser fixture with `node test/documents/panels/visual.mjs`. Screenshots go to `test-results/documents-panels` (or `DOCUMENTS_PANEL_SHOTS`). The fixture uses a controller double, never a generated engine or a real user document.
