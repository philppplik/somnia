# Animation P3: timing, animated effects and local snapshots

P3 builds on P2 and its design-system fix. No dependencies, native builds, format associations or publication changes.

## Roadmap delta

- Blur/tint strength now has optional typed scalar keys. Enable animation, add/update/remove keys at playhead, jump to named key times, bypass or reorder effects. Preview and PNG export sample the same property evaluator and clamp effect bounds. Disabling animation bakes the sampled strength into the base amount, undoable. Tint colour and effect enable/bypass remain static.
- Parent selection exposes existing cycle-safe hierarchy, including Null objects. The timeline marks parented layers, names Null objects and offers selection of a layer's parent. Parenting uses local transforms, so reparenting can move a layer; it is not a keep-world-transform operation. Null layers remain non-rendering controllers.
- Original fade/slide/bounce/typewriter entrance presets apply from the playhead as one transaction. One-second UI defaults, command duration 0.1–30 seconds. Existing keys are refused, not replaced. Bounce is a bounded damped procedural curve baked into at most 61 keys. Typewriter samples Unicode code points and keeps full source text intact.
- Composition timing markers: add/remove, sorted time labels, jump, previous/next marker and current frame number. No audio, sound generation, analysis or clock-sync claims.
- Explicit experimental local `.somnia` snapshot save/open uses the proposed `animation/document.json` plus optional `animation/view.json` ZIP entries. Current canonical image assets remain embedded in the document. No manifest field, global `.somnia` routing, OS association or final container schema decision was made. No `.aep` support.

## Save safety

- Confirmed File System Access save: serialize a validated immutable snapshot, create a writable stream, write and close. Clear dirty and recovery only if the same document identity/revision is still open. A divergent undo/edit branch with the same revision number does not count as the saved document.
- Without File System Access: download a copy, show that saving is not confirmed, and keep dirty/recovery. Cancellation and failed writes keep recovery. Provisional streams are aborted on failure.
- Open: local file input only, no external fetch. Dirty replacement asks confirmation through the open button. Parse/validate before replacing the open session; concurrent document changes abort import. Invalid/foreign/newer data leaves the session intact.
- ZIP input and expanded data capped at 8 MB, allowlisted entries only; oversized entries are rejected before expansion by the ZIP filter. Unknown document schemas, invalid layer/effect properties, missing assets and parent cycles reject. Optional view state is narrowed and bounded, not trusted as document authority.
- This is local-browser file work, not a claim that desktop native temp-file/fsync/rename integration or the final container owner contract has shipped.

## Validation

- 79 unit/security tests: Animation P0/P1/P2/P3 plus Interface media fixtures. Existing tests retained. New tests cover animated effects, bounds, baking, undo, cycle rejection, Null transforms, presets, Unicode reveal, markers, local snapshot round-trip, malformed/foreign/oversized ZIP data, write failure/cancel and concurrent-save identity.
- `npm run check:ds` passes without baseline changes. New controls use the existing DS native controls and shared InspectorNumberField. No new raw-input/select or inline-style debt.
- Full `tsc --noEmit` has only the known absent `slides-engine/pkg/somnia_slides.js` prerequisite; no Animation errors.
- Real isolated Chrome review: animated blur controls, typewriter rendering, Null parenting, markers, .somnia copy download and reopening with assets/effects/markers intact. German dark/light pixels inspected at 1440x900, 1280x720 and 960x600. Long German save label wraps after a pixel-review fix. Isolated fixture is not the full application.
- `tests/animation-p3.spec.ts` is CI-only app coverage and was not run locally. Native/WASM, full app save/open and platform-specific file picker tests remain CI/release gates.
