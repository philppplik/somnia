# Animation P9: layer parenting UI and text animators

## Timeline parenting

Every layer row in the timeline has a parent picker. It lists the other layers of the composition and hides any layer that would create a cycle. The "Keep world transform" checkbox in the timeline toolbar applies to the next reparent: with it on, the pose at the playhead is preserved (same rule as the inspector, static anchor required). Both pickers dispatch `animation.layer.parent`, one undo step each.

## Per-character text animators

A text layer holds up to 4 animators (`Layer.animators`). Each one has:

- a selector range `start`..`end` in percent of the characters, with a `softness` ramp at both edges,
- a keyable range `offset` (-100..100 percent) that slides the range over time,
- the values applied inside the range: shift `[x, y]` in px (limit 2000), `scale` percent (0..1000) and `opacity` percent (0..100).

Characters are Unicode code points. The weight of a character is a pure function of its index, the animator and the offset at the tick, so previews and exports match and there is no randomness. Shifts add, scale and opacity multiply across animators. Typewriter reveal still decides how many characters are shown; weights use the full text.

Limits: at most 4 animators, text of at most 1000 characters while animators exist (document validation rejects more), every number range-checked in `validateDocument`.

Rendering uses one `tspan` per character in the viewer and in PNG/GIF/APNG/WebM export (`dx`/`dy` deltas, `fill-opacity`, scaled `font-size`). Scale changes the glyph size, so following characters reflow by the font metrics of the host.

Edits: `text.animators` (whole list, one undo step). Command: `animation.text.animator` with ops `add`, `remove`, `update`, `offset`, `animate`.

## Tests

`src/lib/animation/animation-p9.test.ts` (logic, validation, export SVG). `tests/animation-p9.spec.ts` is the full-app spec and runs in CI only. Local pixel review: `test/animation-preview.html?animators=1`.
