# Animation P6: text fonts, per-key easing and keep-world parenting

## Roadmap delta

- Text layers pick a font from a bounded allowlist of safe system stacks (8 ids: system UI, Arial, Helvetica, Georgia, Times New Roman, Courier New, Verdana, Trebuchet MS). The document stores only the id; rendering resolves the CSS stack (`textFontStack`). Nothing is bundled, downloaded or fetched. Unknown ids fail validation and edits; documents without a font id keep the previous system-ui rendering, so older snapshots are unchanged.
- Per-keyframe easing: the inspector shows the ease of the key at the playhead (Ease, Ease in, Ease out or Custom) beside the existing interpolation choice, and the new command `animation.key.ease` applies a preset to that one key. The graph editor offers the same preset row as the timeline (linear, ease, ease in, ease out, hold) for the selected keys. `easePresetOf` names the preset a key matches, comparing shared handles or one channel.
- Keep-world parenting works with animated hierarchies. The world pose is preserved exactly at the reparent time: for an animated property the value at that time is rewritten into the new parent space (a key is inserted when none sits there), an existing key keeps its interpolation and easing, and spatial tangents are re-expressed exactly through the linear part of the inverse parent matrix. Other keys keep their local motion, now read in the new parent space. The honest refusals stay: singular parent transform, shear or reflection, scale outside 0 to 10000, an animated anchor on the reparented layer, and per-channel easing under a rotated parent (the channels would mix and the stored handles would lie).

## Limits and non-claims

- Font rendering depends on the host: these are fallback stacks, metrics differ between platforms, and no font file ships. Text is still one styled run: no per-run styling, no text on a path, no line spacing or tracking controls.
- Keep-world preserves the pose at one time only; it is not a bake. Between keys an animated child follows its parent as with ordinary local-space parenting.
- No new easing types beyond the existing presets and handles; the speed graph is unchanged.
- Full-app, native-shell and WASM gates remain CI-only.

## Validation

- 6 new unit tests (`src/lib/animation/animation-p6.test.ts`): font allowlist acceptance/refusal, snapshot round trip and SVG stack rendering, `easePresetOf` shared and per channel, keep-world with animated parent and animated child (pose at t preserved, key inserted, detach keeps pose), exact tangent re-expression under a rotated scaled parent, per-channel ease refusal under rotation and preservation when axis-aligned. One P4 test updated: keep-world no longer refuses animated hierarchies and now refuses an animated anchor. 108 Animation tests in total pass; i18n (28 tests), `check:ds`, `check:ui-commands` (301 commands) and `check:layers` pass.
- Isolated real Chrome (`test/animation-preview.tsx`): the title uses the Georgia stack, the raster logo is parented to a null rig with keep-world, and `?key=1` shows the inspector with the font and per-key ease selects. German light and dark pixels reviewed at 1440x900.
- `tests/animation-p6.spec.ts` is CI-only full-app coverage and was not run locally.
