# Slides package 4: corpus and diagnostics

Base: package-3 94dce331509bb45e87eca81244d62b84b4af1124. Local only, no push/merge/release.

## Corpus and provenance

Nine pinned/hash-recorded PPTX files in slides-engine/corpus:
- Six LibreOffice core regression fixtures whose docProps/Application metadata says Microsoft Office PowerPoint: columns, image, chart, RTL paragraph, SmartArt, table. Metadata is producer evidence, not proof of every author's identity or a fresh PowerPoint run. MPL-2.0 repository fixture license retained, no relicensing.
- Two public openxml-audit fixtures whose repository README describes native Google Slides exports. Producer provenance is that repository's documented claim; no authenticated user identity is asserted by Somnia. MIT repository license and original provenance README retained.
- One actual locally produced LibreOffice 7.3.7.2 PPTX roundtrip of our independent fixture; Application metadata confirmed. This is a real app export, not a manually relabeled package.

manifest.json records byte hashes, sizes, observed producer metadata, pinned source URLs and license scope. These are TEST assets only, not bundled in the product/public assets. Public sources: https://github.com/LibreOffice/core/tree/master/sd/qa/unit/data/pptx , https://www.libreoffice.org/licenses/ , https://github.com/BramAlkema/openxml-audit/tree/main/data/corpus/gsuite_native_export/pptx , https://github.com/BramAlkema/openxml-audit . Exact pinned file URLs are in manifest.json. Font payloads from the Google fixture remain fixture-only; MIT repository coverage is recorded, not a legal provenance audit of embedded assets.

## Diagnostics and bounds

Worker structural diagnostics list charts, SmartArt, OLE (never executed), transitions/animations (not played), embedded fonts (fidelity not guaranteed), speaker notes (retained/not shown), external relationships (not fetched) and missing/noncanonical editable text. Unsupported text remains preview-only. Generic render caveat is always shown.

Actual pixel inspection found smartart-cycle.pptx and table-list.pptx imported and rendered successfully but uniformly blank. That is NOT compatibility success. A 32x32 pixel uniformity check now emits a visible warning to verify unsupported/empty content in the source app. Uniform color could be intentional and the warning says "may"; it is not a diagnostic proof of upstream panic. The SmartArt screenshot was re-inspected after warning landed.

Worker RPC exposes WASM allocated linear-memory size. Observed post-render size over 256 MiB terminates the worker and reports the budget. Existing 30-second execution deadline remains. This is a POST-OPERATION OBSERVATION, NOT a hard allocator ceiling, total process memory cap, JS heap peak or guarantee against transient allocations. Corpus first-slide allocated WASM memory was 9-14 MiB. CDP records Chrome main-target JSHeapUsed/Total separately; that excludes worker JS heap and is not added to claim total memory. metrics.json records single-run wall timing and these measurements, no representative medians.

256 deterministic malformed ZIP samples, 32-159 bytes, reject within a 5-second test budget. Existing Rust expanded-ZIP caps and rejection tests remain. This is bounded smoke fuzzing, NOT coverage-guided/native cargo-fuzz evidence. Larger mutation corpus, decompression fuzz, parser recursion/image decode heap instrumentation and worker heap peak remain open.

## Verified

- Whole TypeScript/Vite production build passed.
- 14 focused tests passed including mixed corpus diagnostic/edit-copy smoke and deterministic malformed-ZIP rejection.
- Nine real production-browser corpus imports and first-slide renders pass technical smoke checks, with visible structural caveats. Render success is not visual parity. SmartArt case is explicitly classified as blank/unsupported despite successful import.
- Nine existing Studio E2E remain green (editing/copy/dirty-close/routing/thumbnails).
- All nine corpus screenshots actually inspected (last four in a labeled contact sheet): Google native effects and clipboard textbox, LibreOffice roundtrip, chart, SmartArt, three columns, shape/image, RTL paragraph and table-list. Google text/LO title/chart/three columns visibly present, warning panels readable and no UI overlap. SmartArt AND table-list visibly blank with warnings. RTL has a missing-glyph box next to Text, another fidelity limit. Shape/image has ordinary text and a visibly warped text image; without a source-app reference no parity verdict. No PowerPoint or Google Slides native app UI comparison performed.
- Dedicated Slides CI now executes corpus browser suite in addition to normal Studio E2E.

No native desktop build rerun for this frontend-only package; package-3 missing glib desktop-check limitation remains. No native/WebView signoff. No cross-platform heap measurements.

## Integration and remaining

New corpus and diagnostics files are studio-scoped. Worker protocol/client/session expose diagnostics/memory; inspector shows them. Shared edit only adds corpus command to existing dedicated Slides CI. Preserve earlier parallel Studio maps and native permissions. Presentation glyph remains builder-owned.

This is an initial mixed-producer corpus, not 20-50 independent deck coverage. Expand to complex masters/layouts, rich/split runs, custom namespaces, hidden slides, corruption/ZIP64, large images and table/diagram variants; add reference-app parity images and native WebView memory. Avoid full-compatibility or hard-heap claims from current results.
