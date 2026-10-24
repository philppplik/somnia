# Agent area DS adoption (P21)

All raw `<button>`/`<input>`/`<select>`/`<textarea>` controls in
`phase1/src/components/agent/` (48 across 9 files) now render through the
geometry-free native control primitives (`NativeButton`, `NativeInput`,
`NativeSelect`, `Textarea` from `ui/native-controls`). Chat panel geometry,
consent checkbox inline sizing, proposal review actions, MCP tool grant rows
and provider auth flows are preserved unchanged; this is an element-owner
swap, not a restyle.

- Ratchet: agent area budget and all 9 file allowances are at zero;
  reintroduction fails `check:ds` with a lint diagnostic.
- Unit coverage: `src/components/AgentAdoption.test.tsx` (3 cases: proposal
  review actions, consent notice gating with preserved inline checkbox sizing,
  no-raw-control source scan).
- Browser coverage: `test/design-system/agent-adoption.spec.ts` drives the
  real proposal review and consent notice on fixtures (`?view=agent` gallery
  route): reject callback, consent gating without a settings write, plus
  light/dark production-style screenshots. Before/after pixel comparison
  against the pre-migration tree is identical in both themes.
- Actual app agent E2E remains CI-only.
