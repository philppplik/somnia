# Vector Studio hero action: Export...

Status: implemented locally following the approved hero-action work; see [implementation](../studios/vector-hero-export.md) and [verification](../studios/hero-creative-verification.md).
Research date: 2026-10-13. Code baseline: `int/shell`, `e2a188d3`.

## Recommendation and why

Replace the universal Publish button beside Account with **Export...**. One click opens the active drawing's export setup, not a file write. Vector work typically ends with a reusable SVG or raster asset. Node editing, alignment and arrangement remain selection-specific tools, not global header actions.

### Product evidence

- Inkscape's community manual describes an Export icon in the commands bar that opens the dockable Export dialog. Format, page/selection/document scope and destination are chosen before export. This supports a visible setup entry, not an immediate download. The source is a documentation fork, not verification of the latest released UI: https://inkscape-ltlnx.readthedocs.io/en/latest/doc-management/export/export.html
- Affinity Designer documents a normal Export dialog and a separate Export Persona for slices/layers. It offers selection-area versus selection-only options. This supports a simple front door with richer asset export kept secondary; it does not establish a top-right button position: https://affinity.help/designer/en-US.lproj/pages/ExportPersona/exportSettings.html

Choosing Export for Somnia is a product recommendation, not a claim that all vector editors use the same header.

## UX

1. Keep the button in the existing action position before Account. Use the registered VectorExport glyph, a text label and an accessible name.
2. Open/focus the existing Export panel in the right stack. This is the low-effort v1, not a new modal. Repeated clicks focus it, never close it. Scroll its setup into view if needed.
3. Show SVG and PNG, with 1x/2x/4x for PNG and the actual output pixel dimensions. Whole page only in v1. Selection export, PDF, slices and batch presets are not supported promises.
4. Separate the output controls from the existing panel's SVG import controls. Export submits only after the user chooses a format. Current handlers produce browser downloads, including Vector's current desktop frontend path; do not imply a native destination picker already exists.
5. Show the effective dimensions after the engine's 8192-pixel-per-side cap. Do not advertise an uncapped 4x result. Explain scaling limits before submission.
6. Disable without an active ready vector document. Opening the setup does not mutate the drawing or clear dirty state. Errors stay in the existing diagnostics flow. Cancel/closing the panel writes nothing.

A dedicated export popup can follow if Philipp wants modal parity with Photos. That is a second UI host over the same controls/commands, not a new export engine.

## Existing Commands and code ownership

| Existing command | Use |
| --- | --- |
| `vector.exportSvg {}` | Final SVG export only; immediately downloads |
| `vector.exportPng {scale?}` | Final PNG export only; immediately rasterizes/downloads |
| `vector.clearError {}` | Existing diagnostics recovery, not run implicitly |
| `vector.toSvg {}` | Read-only serialization; not a save/export confirmation |

A new UI-only `vector.export.open` would focus the registered `vector.export` panel. It does not exist today. Keep panel ownership in the shared panel stack and command registration in the Vector adapter. Do not call download functions from the header.

Grounding: `phase1/src/lib/studios/vector.ts`, `phase1/src/lib/vectorstudio/shellCommands.ts`, `phase1/src/lib/vectorstudio/exportFiles.ts`, `phase1/src/components/vectorstudio/VectorPanels.tsx`, `docs/studios/vector-shell.md`.

## Studio-agnostic shell contract and Publish

The current `StudioShellDef` has menus, panels and rails, but no header hero slot. A shared additive slot needs separate shell-owner approval. This studio supplies data only: command ID, localized label key and registered icon key. The shell renders one generic action and derives enablement from the command registry; it must not branch on `studio === 'vector'` or import export code. Existing panel/context ownership and non-agent-callable UI-command boundaries stay intact.

Keep `deploy.open` in the shared Project > Publish entry and command palette, with its existing `Mod+Shift+U` shortcut and availability gate. It opens setup/review, never bypasses deployment confirmation. Currently the explicit Code manifest includes it; the shared menu owner must confirm it is discoverable in Vector too. Do not equate local asset export with publishing a website.

On constrained widths, the shared action overflow contains the same Export entry with the same command. Publish stays secondary, not a second colored header button. Keep menus, Studio pill and Account spatially stable. No new shortcut until the shared shortcut inventory is checked.

## Effort and acceptance

Rough estimate, not a delivery promise: 0.5-1 developer day for panel-focus command, manifest data and tests after the shared header slot exists. Add 1-2 days if a dedicated popup is chosen; excludes encoder changes and native save-dialog work. Shared slot/menu/overflow work is counted once by the shell owner, not in each studio estimate.

Acceptance: open/focus without export; SVG/PNG choices reuse commands; page scope and capped dimensions are honest; no dirty-state reset; empty/error/ready contexts and stale studio switching are tested; labels exist in all five locales; light/dark and narrow-width screenshots are inspected; Publish remains reachable and retains review gates. These checks describe future implementation, not tests run for this concept.

Roadmap-Delta: promote existing Vector export to the hero slot; add a focus-only command. Selection export, slices, PDF, native destination picking and dedicated popup remain separate scope.
