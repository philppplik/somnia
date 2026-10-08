# A2 retained-worker progress, not full inline layer integration

The WASM bridge now uses real PhotoCraft doc/compose crates (same pinned upstream
revision as T1), with retained Document, Layer and LayerMask state. Worker API:
open bounded RGBA document; duplicate/visibility/opacity; set/clear grayscale
mask; undo/redo; query/render; close/free. Actual browser execution checks
composited pixels, mask transparency, undo restoration and unknown closed IDs.

Actual upstream wand_region and polygon selection routines are also exported
and executed in the worker. Chromium checks wand coverage and polygon coverage.
These are APIs and runtime evidence, not yet connected to SelectionEditor UI.

Bounds are deliberately conservative: <=1MP/document, 4 retained docs, 32 layers,
30 history steps, polygon <=4096 points. Document clones use upstream tiled
surface sharing; memory behavior under arbitrary mutations is not yet profiled.
The caller's layer indexes are validated in Rust. Worker release calls free.
The existing inline editor still uses its A1 intent model, not these docs.

Validation: TypeScript and app build pass; Chromium suite 10 passed, 1 stress
check separately enabled and passed; retained document and upstream selection
coverage were both actual WASM runtime tests. Existing 3 Rust tests pass.
Updated dependency inventory and license listing include doc/compose additions.

Remaining before full A2: worker-document integration with inline tabs/layer UI,
legacy op migration to actual adjustment/smart-filter layers, PSD read with
bounded hostile-file handling, masks UI, source-space selection bridge,
tiled/full-res export and native WebView verification. No PSD support is claimed.
No A3 features are implemented. Preserve this progress rather than marketing it
as completion of the full concept phase.
