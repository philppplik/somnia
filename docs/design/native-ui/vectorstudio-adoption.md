# Vectorstudio area DS adoption (P22)

All raw `<button>`/`<input>`/`<select>`/`<textarea>` controls in
`phase1/src/components/vectorstudio/` (36 across 6 files, including the tools
subdirectory) now render through the geometry-free native control primitives
(`NativeButton`, `NativeInput`, `NativeSelect` from `ui/native-controls`).
Tool toggles, transform dimension inputs, node-type actions, hidden file input
and canvas select are preserved unchanged; this is an element-owner swap, not
a restyle.

- Ratchet: vectorstudio area budget and all 6 file allowances are at zero;
  reintroduction fails `check:ds` with a lint diagnostic.
- Unit coverage: `src/components/VectorstudioAdoption.test.tsx` (3 cases:
  tools panel toggles and dimensions, node panel actions, no-raw-control
  source scan). The existing `tools/panels.test.tsx` (3 cases) and
  `tools/operations.test.ts` are unmodified and passing.
- Browser coverage: `test/design-system/vectorstudio-adoption.spec.ts` drives
  the real tools and node panels on a fixture document (`?view=vectorstudio`
  gallery route): dimension edit commits on blur, tool switch, plus light/dark
  production-style screenshots. Before/after pixel comparison against the
  pre-migration tree is identical in both themes.
- Follow-up fix (P24): the panels' inline `vectorControlStyle` referenced
  non-existent tokens (`--surface`, `--border`), so the light fallbacks
  applied everywhere and dark-theme controls were unreadable. It now uses
  `--bg-surface`, `--border-default` and `--text-primary` with the same
  fallbacks; dark theme is legible, light theme shifts the control
  background slightly (intended diff, before/after screenshots delivered).
- Actual app vectorstudio E2E remains CI-only.
