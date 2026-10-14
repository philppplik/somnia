# Vibespace area DS adoption (P16)

All raw `<button>`/`<input>`/`<select>`/`<textarea>` controls in
`phase1/src/components/vibespace/` (108 across 13 files) now render through the
geometry-free native control primitives (`NativeButton`, `NativeInput`,
`NativeSelect`, `Textarea` from `ui/native-controls`). Bespoke `vs-*` classes,
board drag/keyboard behavior, the run-card layout, create-form semantics and
model-setup probe logic are preserved unchanged; this is an element-owner swap,
not a restyle.

- Ratchet: vibespace area budget and all 13 file allowances are at zero;
  reintroduction fails `check:ds` with a lint diagnostic.
- Unit coverage: `src/components/VibespaceAdoption.test.tsx` (4 cases: board
  pending controls, create forms, model-setup re-probe button, no-raw-control
  source scan) on top of the existing 143 vibespace unit tests. One existing
  assertion in `board.test.tsx` was made attribute-order tolerant because
  NativeButton renders `data-slot` before `type`; its assertion strength
  (exactly two disabled Stop buttons) is unchanged.
- Browser coverage: `test/design-system/vibespace-adoption.spec.ts` drives the
  real board, create forms and model setup on fixture hosts
  (`?view=vibespace` gallery route): pending toggle, steer input disclosure,
  send/cancel events, plus light/dark production-style screenshots.
  Before/after pixel comparison against the pre-migration tree is identical in
  both themes.
- Actual app vibespace E2E remains CI-only.

## P11 specificity side effect (fixed in P18)

The P11 selector `.vs-root button:not([data-slot="button"])` (specificity
0,2,1) outranked `.vs-root .vs-run-open` (0,2,0), so run cards rendered
pill-like. P18 raises the override to `.vs-root button.vs-run-open` (equal
specificity, later source order wins); `vibespace-adoption.spec.ts` now asserts
the run-open button's computed padding, border width and background so a
regression fails the gallery spec.
