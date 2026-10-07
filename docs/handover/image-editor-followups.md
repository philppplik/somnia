# Image editor follow-ups (kept so they are not lost)

State on somnia-agent: core (image-editor), CPU kernels (image), transform ops (imgedit), adjust op (imageedit/adjust) are merged and tested, but no panel is mounted in the app yet and the shell (native read/save) is not built.

1. Kernel duplication. `src/lib/imgedit/transform.ts` (premultiplied resize incl. nearest, bicubic rotate with background) and `src/lib/image/{resize,transform}.ts` are two implementations. The imgedit one is leading. Later: switch `image/` to it, with a parity test (same input, same output within tolerance) before deleting the other.
2. Adjust shader. The core calls `fragmentShader(params)` with constants baked in (recompile per slider tick, program cache capped at 32). Later: core support for the uniform variant `buildFragmentShader()` for live sliders.
3. Adjust math partly duplicates `src/lib/image/adjust.ts`. Align together with the parity test from item 1.
4. Not verified: real WebGL (WKWebView, WebView2), core browser test `scripts/image-core-browser.test.mjs` in CI, panels visually inside the app.
5. Native folder dialog command for the Convert files dialog (macOS has no showDirectoryPicker).
