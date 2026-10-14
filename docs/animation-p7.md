# Animation P7: animated export - GIF, APNG and real-time WebM

## Roadmap delta

- The render panel exports the work area as an animated GIF, an APNG or a WebM video beside the existing PNG frame and PNG sequence exports. New commands `animation.export.gif`, `animation.export.apng` and `animation.export.webm`; every animated export runs through the shared job state with StudioProgress, frame-accurate progress and a cancel button.
- `gifEncode.ts` is a self-contained GIF89a encoder (no new dependencies): median-cut palette over the sampled frames (up to 256 colours), per-frame graphics control with the frame delay, NETSCAPE looping, and a from-scratch LZW compressor with deferred clears. GIF and WebM flatten onto the composition background colour; APNG keeps the transparency setting.
- `apngEncode.ts` assembles APNG from the same rasterised frames encoded as PNG by the browser: acTL with the frame count, one fcTL per frame carrying the delay as a rational, first frame as IDAT, later frames as fdAT with running sequence numbers, CRCs re-verified by a chunk walker.
- `exportVideo.ts` records WebM in real time through `canvas.captureStream` and `MediaRecorder` (VP9+Opus preferred, VP8+Opus fallback, picked via `MediaRecorder.isTypeSupported`). Frames are drawn from the animation clock, not from a timer guess, so the picture matches what preview shows at that instant. When the composition has audible audio layers, the preview mixer (P5b) is started against a `MediaStreamDestination` and its track is added to the recording - the exported WebM carries the same mix the user hears in preview.
- `audioPreview.ts` accepts an optional destination node so the same mixer feeds either the speakers or the recorder; no second mixing path.

## Limits and non-claims

- WebM records in real time: a 5 s work area takes 5 s to export, capped at 60 seconds. GIF is limited to 300 frames and 256 colours per frame (dithering is not applied; gradients band). Every output file is refused beyond 64 MB. APNG delays are stored as a rational of the frame rate.
- The WebM audio track is the preview mix only: it follows preview volume/trim/offset, but there is no separate export mix, no per-export audio settings, and no muxing into GIF/APNG (they stay silent by design).
- WebM support depends on the browser's MediaRecorder; where no WebM mime is available the command refuses with an honest error. No new dependencies, no WASM, no server-side encoding.
- Full-app, native-shell and WASM gates remain CI-only.

## Validation

- 7 new unit tests (`src/lib/animation/animation-p7.test.ts`): LZW roundtrip including table resets against an independent test-side decoder, GIF89a structure (signature, NETSCAPE loop, per-frame delays, trailer) and palette determinism, GIF frame/byte caps, APNG assembly (acTL count, fcTL delays and sequence numbers, CRC re-check) and malformed-input refusal, webmPlan duration/pixel/mime bounds, and a recordWebm run with a fake recorder covering progress monotonicity, cancel and the byte cap. 108 + 7 Animation tests pass; `check:ds` (38 areas, budgets unchanged) and `check:ui-commands` (301 commands, 5 locales) pass.
- Isolated real Chrome (`test/animation-preview.tsx`): a 2-frame GIF and APNG encoded through the real code path decode in `<img>` at the right size, and a 1 s WebM recorded through the production deps (real canvas, captureStream and MediaRecorder) plays back in `<video>` (15 KB, VP9+Opus). German light and dark pixels of the export panel reviewed at 1280x800.
- `tests/animation-p7.spec.ts` is CI-only full-app coverage and was not run locally.
