# Bounded PSD read-only progress

The media open path accepts PSD v1 and shows a separate read-only viewer.
Actual lazy WASM worker parses photocraft-psd at the pinned upstream revision,
decodes merged pixels and lists layer names. Original blob remains untouched.
No editable raster/document is constructed from the flattened composite; no
save/overwrite controls, no PSD write claim. RGB8 only, <=1,048,576 pixels,
axes <=4096, 3/4 channels, <=16 MiB, <=32 layer names. PSB, CMYK, higher depths
and declared placeholder merged data fail visibly instead of silently baking.

Safety: header checked before parsing, section lengths checked with overflow
handling, layer count checked before upstream allocations. ZIP preflight
reads at most expected+1 bytes, rejects oversized output. Worker timeout and
termination bound stale source jobs. Upstream validates raw/RLE/ZIP data;
malformed parsing never falls back to editable raster. This is bounded read,
not a claim that arbitrary PSDs are safe or visually faithful. ICC color
management is not applied. Layers, masks, effects, smart objects are not
imported. Native dialogs and commercial Adobe fixtures remain unverified.

Validation: independent raw/RLE/ZIP fixtures exact Chromium pixels; Unicode
layer metadata fixture; truncation, overflowing dimensions/sections, CMYK,
16-bit, zero size, 33-layer, PSB, placeholder merged and ZIP excess rejected.
14 dev + 14 production pass. One prior dev run had a menu filechooser timeout,
then rerun passed; no decoder failure. Inspected actual Light preview pixels
and metadata layout. Existing production raster regression 6/0; native Rust
3/0; TS focused 8/0; tsc/build pass. Full core current suite 1474 passed,
0 failed,18 skipped,26 todo (`--test-force-exit` for existing live handles).

Remaining A2: faithful PSD layer import, adjustment/smart-filter migration,
general >1MP retained storage, tiled full-resolution export, persistence,
localized strings, native WebView2/WebKit runtime. This patch is only a read
milestone, not completion of full A2.
