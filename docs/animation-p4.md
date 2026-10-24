# Animation P4: parent preservation, keyed colour, outlines and bounded export

## Roadmap delta

- Keep-world-transform parenting is an explicit optional control/command. Static translate/rotation/positive-scale matrices are decomposed with anchor preserved. Reparent and detach preserve world matrices. Animated hierarchies, singular parents, reflection, shear and unsupported scale are rejected, not approximated or baked without permission. Local-space parenting remains available.
- Tint colour keys interpolate RGB channels linearly; effect alpha is unchanged. Colour picker creates keys once animation exists. Colour-key time buttons navigate. Bypass at playhead writes discrete hold keys, sampled exactly on their tick; base enabled/bypass remains the default before the first key. Keys persist with the existing effect stack and local snapshot.
- Shapes include a bounded editable normalised M/L/Z path (2–256 points, coordinates 0–1) alongside rectangle/ellipse. Trace-outline and dash-motion presets add typed scalar stroke keys without changing fill or geometry. Width/colour are editable, keyed times navigate. Path-length normalisation keeps stroke timing independent of geometric length. These are outline trim/dash, not arbitrary footage clipping or Bezier topology morphing.
- Preview and PNG export share colour/bypass/stroke sampling. Filter bounds include stroke growth, avoiding a clipped outline. New controls keep the DS ratchet green without new budgets.
- Real reference export remains PNG frame or PNG sequence ZIP with exact-tick manifest and optional alpha, not fake GIF/WebM. Sequence preflight now rejects before allocating the frame plan; bounded to 1800 frames and 64 MB aggregate PNG data. Export runs from a captured composition/assets revision, shows StudioProgress, and checks abort immediately after each rasterisation before ZIP/progress publication. Cancellation produces no partial download. GIF/WebM require separately verified encoding/muxing capabilities and are not advertised here.

## Validation

- 85 passing Animation P0/P1/P2/P3/P4 plus Interface media tests. New coverage: keep-world matrix preservation/refusal, keyed tint/bypass sampling, bounded path geometry, trim/dash keys/export, source bounds and cancellation during rasterisation.
- `npm run check:ds` passes with baseline unchanged. `tsc --noEmit` has only known missing slides-engine WASM module. No cargo/WASM build here.
- Real isolated Chrome: six PNG frames rendered with exact 8000-tick manifest steps and one extracted frame pixel-inspected. UI PNG sequence download also completed. A 900-frame sequence was cancelled through StudioProgress; error reflected cancellation and no partial download occurred.
- German dark/light pixel review at 1440x900, 1280x720, 960x600. UI sample intentionally combines trim and dash offset; some playhead values place the drawn segment off the path's visible portion, while exported earlier frames visibly show the stroke.
- `tests/animation-p4.spec.ts` is CI-only full-app coverage and was not run locally. Native/WASM/platform/GPU parity remains CI/release work. Isolated browser fixture is not full-app proof.

No new dependencies, paid services, format associations, manifest adoption, main pushes or releases.
