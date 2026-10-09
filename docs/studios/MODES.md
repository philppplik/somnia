# Studio modes

A Studio chooses the editor workspace. A mode chooses a real working surface inside that workspace. Switching either is shell state, not a save, conversion, history edit or AI approval.

## Shipped surface

Code exposes its existing Visual (Design view), Split and Code modes through **View**. Markdown keeps its Preview / Split / Source labels. The mode is remembered independently for each text document and Studio for the current session. Menu, palette and keyboard changes share the same memory. Returning to a tab or Studio restores its last mode. A new document starts with the manifest's first mode. The global Agent, document contents, dirty state and undo history do not change.

The six manifests at beta.5 are Code, Documents, Slides, Sheets, Sound and Video. Only Code declares multiple working surfaces on this base. Studios with no modes do not display empty radio groups or separators. There are no speculative Develop, Layout or Export buttons. Photo development is an inline editor on this base, not an independently registered Studio.

Mode controls remain in the existing View menu, keeping the top Studio pill free of duplicate controls. Native raster, vector and PDF inline editors retain their own toolsets; Code view commands and Split-layout commands cannot change their surfaces. The same capability checks apply to keyboard and palette execution.

## Manifest contract

`StudioDef.modes` is optional. A mode has:

- `id`: stable Studio-local identity;
- `label`: translation key, or an English literal supported by the existing translator;
- `command`: a registered command which actually changes the working surface;
- `viewMode`: optional existing Code canvas view (`design`, `split` or `code`).

Without explicit modes, the compatibility adapter reads `shell.header.views`. An explicit empty array suppresses the legacy modes. A Studio whose host implements new modes contributes them through this contract and owns the command and surface implementation. The generic picker never guesses an engine's mode, invents a host, creates a file or commits a pending tool. Commands missing from the registry, disabled commands and native inline editors cannot run through the picker.

The store's `studioModeByDocument` map holds a JSON-encoded pair of Studio ID and document identity. Media and text have separate identity namespaces. Unknown/removed mode IDs fall back to the first supported mode. The map is session-only and cleared when closing the project; it is not written to localStorage and does not disclose file paths to any service.

A completed asynchronous mode command is remembered only if the Studio and document are still the same. Modes with their own non-Code host must own restoring that host's surface; this initial layer supplies memory and picker state, not a universal engine-mode setter.

## Validation and integration

- `src/lib/studioModes.test.ts`: legacy compatibility, empty contribution, fallback, identity separation, explicit contributions, tab/Studio round trips, pending-tool refusal, document/global-state preservation and Code-command refusal outside Code.
- `src/lib/studios.test.ts` and `src/lib/commands.test.ts`: existing Studio and command regression checks.
- `tests/studio-modes.spec.ts`: full-app menu/shortcut round trip and absence of phantom modes. Run this in the normal WASM-equipped checkout.
- Actual View-menu component visually inspected in a local isolated React/browser harness. Split selection, checked state, labels, shortcuts and readability were checked. This is not full-app or native validation.

The fresh source checkout excludes generated WASM packages. Full application typecheck, production build and full-app browser tests require those real packages, including `slides-engine/pkg`, to be built or restored first. No fake WASM modules are part of this patch. The Studio pill and host map are untouched, avoiding conflicts with the concurrent chrome, empty-state and new-Studio work.
