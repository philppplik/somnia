# Sheets cached selected text preview (BM)

Visible workbook disclosure, explicit Review displayed text. Reads only current
formatted ViewCell cache, no new worker range/view calls or model inference.
Select <=100 cells, per-text4096bytes/aggregate16384, visible sheet/layout lines,
no merges. Missing/offscreen/hidden/oversized/malformed cells reject whole preview,
never partial/first-N. Returns only address+formatted text, no formula/raw values.
Formula result display is text, not formula-source or calculation permission.

Current sheet/revision cache stamp prevents reading previous sheet/revision map.
Active editing draft blocks preview. Internal owner URL/sheet/revision/range/text
scope resets explicit-review state on drift; no URL display/fetch, no persistence,
no copy/export/write/save. Rendering literal, five locales. It's a cached-source
review, not an atomic live workbook capture/lease or reliable pending-edit snapshot.
Full host-owned Sheets generation/revision/range acquisition remains later work.

2 pure helper and all existing Sheets unit/component tests pass (41 total);
2 browser cases cover explicit review, inert HTML, scope discard, five locales and
light/dark390px readable/no overflow. First browser run caught missed locale table
shape; corrected row catalog and rerun passes. No existing test changed/weakened.
DS/Commands/Inventory/Layers pass inherited compiler/87ignored/4stale caveats;
tsc only inherited Slides missing. No native/WASM/full shell E2E; cache-stamp grid
integration is source/typechecked, browser component synthetic, not real workbook.

Roadmap-Delta: private visible cached Sheets selection review without reads/inference;
not summary-generation or general range capture. No dependencies/spend/search slice.
