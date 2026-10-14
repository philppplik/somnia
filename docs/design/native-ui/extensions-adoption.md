# Extensions area DS adoption (P15)

All raw `<button>`/`<input>`/`<textarea>` controls in `phase1/src/components/extensions/`
(84 across 10 files) now render through the geometry-free native control primitives
(`NativeButton`, `NativeInput`, `Textarea` from `ui/native-controls`). Bespoke
`ext-*`/`store-*` classes, roving-focus tablists, role="switch" toggles, hidden file
inputs and consent hold behavior are preserved unchanged; this is an element-owner
swap, not a restyle. Consent dialogs already used shared Button/Dialog and were left
as they are.

- Ratchet: extensions area budget and all 10 file allowances are at zero;
  reintroduction fails `check:ds` with a lint diagnostic.
- Unit coverage: `src/components/ExtensionsAdoption.test.tsx` (5 cases: card
  structure, toolbar/chips, tab semantics, badge, no-raw-control source scan) plus
  the existing 9 popup contract cases, all unmodified and passing.
- Browser coverage: `test/design-system/extensions-adoption.spec.ts` drives the real
  surfaces on fixture hosts (`?view=extensions` gallery route): search filtering,
  chips, switch commit, nav tabs, expandable activity target, arrow-key tab roving,
  plus light/dark production-style screenshots.
- Actual app popup/consent E2E remains CI-only (`tests/extension-*.spec.ts`).
