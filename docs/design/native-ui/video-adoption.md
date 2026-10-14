# Video area DS adoption (P27)

All raw `<button>`/`<input>`/`<select>`/`<textarea>` controls in
`phase1/src/components/video/` (30 across 4 files: TitleInspector,
VideoInspector, VideoPanels, VideoWorkspace) now render through the
geometry-free native control primitives (`NativeButton`, `NativeInput`,
`NativeSelect`, `Textarea` from `ui/native-controls`). Element-owner swap
only; no restyle, no behavior change. The remaining video files (canvas,
timeline, filmstrip, export review) already had zero raw controls.

- Ratchet: all 4 file allowances are at zero; reintroduction fails
  `check:ds` with a lint diagnostic.
- Unit coverage: `src/components/VideoAdoption.test.tsx` (no-raw-control
  source scan per file). The existing `lib/video/titles.test.ts` and
  `lib/video/video.test.ts` are unmodified and passing.
- Browser coverage: `test/design-system/video-adoption.spec.ts` drives the
  real video inspector with a selected title clip on a stubbed-engine
  session via the `?view=video` gallery route, plus light/dark
  production-style screenshots. Before/after pixel comparison against the
  pre-migration tree is identical in both themes.
- Actual app video E2E remains CI-only.
