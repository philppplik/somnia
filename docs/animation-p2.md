# Animation P2: motion and bounded assets

Implemented on `int/beta5` after Animation P1. Animation uses the existing Sparkles studio icon and its existing shell manifest. No shared studio routing changed.

## Roadmap delta

- P1 remains intact: value graph, key selection/clipboard, work area/loop, spatial path editing, PNG frame and capped sequence export.
- P2 adds a signed, per-channel speed graph in units/second. Velocity is derived from the evaluated curve inside each segment, never across hold jumps. Holds and clamped regions are zero; undefined jump impulses are not plotted as invented finite spikes. Speed is a read-only alternate plot; value graph owns edits.
- Straight vec2 properties support independent X/Y temporal handles, including keyboard edits, clipboard and recovery. Shared presets explicitly relink channel easing. Spatial paths use shared distance timing; creating spatial tangents while independent channel settings exist is rejected rather than silently losing them. Apply a shared preset first.
- Position paths offer parameter or arc-length timing. A bounded 256-step cumulative-distance table is cached by immutable key identity. Temporal easing controls travelled distance, not the raw Bezier parameter. Existing documents retain parameter mode.
- Text size/content/colour and rectangle/ellipse geometry are editable, alongside existing transform animation. Raster image layers are new.
- Ordered non-destructive blur/tint stack: bypass, reorder, remove, bounded numeric strength, tint colour, undo/recovery. Effects run in source space before layer transform and opacity. SVG filter primitives are shared with preview/reference export; tint retains alpha and blur grows source bounds by three sigma per pass. At most eight effects, blur 0–64 px, tint 0–1. No animated effect parameters in P2.
- PNG/JPEG import reuses Interface's canonical-PNG decoder, signature checks, 1 MB input/output, 4096 px/4 MP, 50-asset and 3 MB embedded-data budgets. SVG reuses the strict Interface parser plus vector validators: at most 200 KB, 200 nodes, depth 16, supported solid primitives and absolute M/L/Z paths only. No scripts, URLs, styles, external fonts, foreign objects or raw SVG survive. SVG becomes an independent canonical PNG snapshot, not editable vector artwork. Unsupported inputs fail visibly and leave the document unchanged.
- Embedded assets, effects and channel ease survive recovery; missing raster references block export. PNG sequence export receives the immutable document's embedded assets.

## Validation

- Local unit/security coverage: Animation P0/P1/P2 plus Interface media tests, 69 passing at authoring closeout. Existing tests retained.
- Isolated Chrome fixture `phase1/test/animation-preview.html` uses real Animation panels/timeline/graph and reference frame output. Reviewed German dark/light pixels at 1440x900, 1280x720 and 960x600. Actual import, hostile-SVG rejection, undo, independent Y handle keyboard edit and speed-mode switching were exercised. An 800x450 transparent PNG was generated with the browser rasteriser and its actual pixels inspected (blur/tint, raster source and alpha).
- Full typecheck reaches one baseline prerequisite error: absent `slides-engine/pkg/somnia_slides.js`. No Animation type errors at closeout. No cargo/WASM builds were run here.
- `phase1/tests/animation-p2.spec.ts` is CI-only full-app coverage. It was not run locally. Native Windows/WebView, actual app persistence/save, WASM builds, broad GPU/CPU parity remain CI/release gates. Isolated previews do not claim to cover them.

## Scope boundaries

No new dependencies, upstream code adoption, paid services, native binaries, main push or release. No claim of full After Effects parity, editable SVG import, footage/audio, masks, precomps, expressions, tracking, compressed export or animated effect parameters. English/German P2 copy is authored; other existing locale catalogues use English P2 fallback strings while preserving key parity.
