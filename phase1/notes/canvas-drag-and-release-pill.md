# Canvas drag selection and release pill

- Canvas element moves keep their existing six-pixel threshold. Once a move starts,
  a temporary iframe stylesheet disables text selection, and any selection started
  before the threshold is cleared. `selectstart` is blocked only during the move;
  native text/image dragging cannot take over a pending canvas element move.
- Pointer up, pointer cancellation, Escape and iframe-window blur remove the
  stylesheet and restore the original inline cursor. Author selection styles are
  left unchanged. No global selection restriction is applied to project previews.
- The status bar now uses Vite's `__APP_RELEASE__`, sourced from
  `package.json.somniaRelease`, rather than the active file's language. The label
  preserves the complete release string. Alpha and beta prerelease identifiers
  select their channel; other versions are Stable. The shell's package version is
  intentionally not used. This patch sets the next release to `11.0.0-beta.3`.

Validation: `npm run build`, `npm run test:core`, and targeted Playwright tests
`tests/canvas-dnd.spec.ts tests/status-version.spec.ts`. Screenshots are generated
under `test-results/`, never an external workspace path. The iframe tests use
synthetic pointer sequences because real mouse dragging in this sandbox hangs
headless Chromium (also documented in the existing drag tests). Selection CSS,
selection clearing and native selectstart cancellation/restoration are asserted;
Windows/WebView2 physical mouse verification remains an owner smoke test.
