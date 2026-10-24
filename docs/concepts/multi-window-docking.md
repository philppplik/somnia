# Multi-window studios and docking: first slice

## Architecture

The main window remains the only project authority. Local satellite windows receive a
one-shot, bounded text snapshot from a Rust-owned handoff registry. They never receive
project handles, credentials, filesystem grants, deployment or MCP privileges. A separate
entrypoint avoids main-window startup, draft autosave and desktop adapters. Editing is an
independent copy, with explicit export and unsaved-close warning. Closing the satellite
never closes or replaces the source document. Native Windows behavior requires desktop testing.

Initial handoff supports Code's text project buffers only. Media and studio-engine edits
are not serialized by appStore; do not pretend that copying files transfers their history.
Live multi-window editing needs document ownership, revision checks, conflict handling,
engine-specific serializers and coordinated shutdown before it can replace this copy model.

## Docking

An opt-in dock frame uses shellV2 PanelDef and the existing PanelHost allowlist. Left and
right tab groups support cross-side drag/drop and keyboard-accessible move controls.
Inactive panels stay mounted. Per-studio layout saves only panel IDs and active tabs,
with stale IDs sanitized. Reset returns to manifest defaults. Existing shell rails remain
available and the unmodified legacy frame remains the default. Native media special panels
and extensions retain their existing frame until migrated to PanelDef hosts.

## Smart links

Already-open text documents can switch to studios that explicitly claim their extension,
using requestStudio with source `open`. This is navigation, not conversion or file import.

## Reference and licensing

Interaction reference: https://github.com/DanFessler/trellis at
9d1da36b602888d80223f2b1e042251a243f9012. README describes nested splits, tabbed panels,
floating panels and mounted views. LICENSE.md uses non-commercial/commercial/enterprise
tiers, not MIT. No Trellis code, styles or package is included. This slice does not yet
provide arbitrary nested splits, floating native panels, zoom or live shared undo.

## Verification and integration

Base: `origin/int/shell` at `7c12cdc1b9ac345482c22168c7afa1ec899ade1c`.
No files under `components/studios/` or `lib/studios/` were changed. Integration hooks
are additive imports/wrappers in App, locale composition, command inventory and Vite
multi-entry configuration. Native hooks add commands and a separate capability;
`editor.windows` remains exactly `['main']` and all existing project gates remain unchanged.

Local checks passed: UI command inventory (190 commands, five locales), IPC manifest,
layer check (no new violations), 90 focused tests including shell/layout/locale/ACL,
and the standalone browser regression in `phase1/tests/workspace/run.mjs`.
The browser test exercises actual HTML5 drag/drop, arrow-key tabs, cross-side move,
reload persistence, reset, independent Code editing/Markdown preview and dirty-close
cancel. Its screenshots were inspected after correcting rails and theme tokens.

TypeScript reports only the existing missing generated Slides WASM module.
Production Vite build is blocked by missing generated Sheets/Raster/Slides WASM packages.
`test:core` was attempted but timed out after 976 reported tests without a summary;
this is not a full-suite pass. Rust is not installed here, so the new native module
and its four Rust tests have not been compiled or run. A desktop owner must run
`cargo check`, the four native tests, and Windows open/export/dirty-close checks before
merging or releasing. No releases, remote pushes or Actions runs were performed.

### Remaining limitations

- The satellite is explicitly a Code editing copy, not a detached live studio and not
  a shared project session. It exports ZIP copies, never saves back to the source folder.
- Arbitrary nested splits, floats, detachable inspectors, live ownership transfer and
  engine/media state handoff are not part of this patch.
- Dock panel size uses browser horizontal resize; sizes are not persisted yet.
- Layout persistence is window-local with a shared storage key; concurrent dock edits
  do not synchronize live. Satellite editing never changes main-window drafts.
