# App background: Solid or Glass

Settings > Appearance > App background is a two-option select. A discrete mode
is deliberate: the native material controls its own blur, so an arbitrary
opacity slider would imply precision the compositor cannot promise.

- **Solid (100% opaque)** is the default, including migration from older settings.
- **Glass (blurred desktop)** lets the desktop show through shell/chrome and lightly
  tinted panel surfaces. Page preview, code, inputs, settings and menus keep their
  normal surfaces for readable text.
- Stored in `somnia.look.v1` with the existing look preferences. Changes apply
  live, support Settings Ctrl/Cmd+Z, and Appearance reset restores Solid.
- Theme/palette colours are preserved. High contrast temporarily forces Solid
  without forgetting the saved choice.
- Linux and the browser app always render Solid, even if Glass was saved on
  another platform. Missing/rejected native effects also keep opaque CSS.

## Native implementation

The existing main window is already transparent. macOS private API support is
now explicitly enabled in Tauri and its config because transparent webviews
require it. This has distribution implications for Mac App Store review; do not
assume this configuration is Mac App Store compatible.

Windows uses Acrylic (actual backdrop, not Mica wallpaper). macOS uses
UnderWindowBackground vibrancy, active even when the window loses focus.
`window-vibrancy` 0.8.1 is already in Tauri's lockfile; it is now an explicit
platform-only optional desktop dependency. We call it directly because the
current Tauri `set_effects` implementation discards the compositor's result,
which cannot safely drive a success-gated transparent frontend.

A gated main-window-only command returns whether the effect was accepted.
Frontend updates are serialized and stale completions ignored. Transparent CSS
is never enabled before acceptance. Switching to Solid removes native effects
and immediately restores fully opaque shell CSS.

Windows Acrylic can lag during dragging/resizing on older Windows builds. Keep
Solid available and check this on the actual release targets. Accepted native
API calls cannot prove that an OS accessibility/policy setting displays blur.

Source API inspected:
- https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindow.html
- https://crates.io/api/v1/crates/tauri/2.12.1/download
- https://crates.io/api/v1/crates/window-vibrancy/0.8.1/download

## Verification

- `npm run build`: passed (existing dynamic-import warnings).
- `npm run test:core`: 475 passed, 3 skipped, 0 failed.
- `tests/window-background.spec.ts`: 2 passed in installed Google Chrome.
  Checks persistence, browser fallback, Settings undo/reset, and produces light
  and dark Solid/Glass screenshots.
- Screenshots named `css-preview` are **CSS previews with simulated native
  acceptance over a gradient backdrop**, not Windows/macOS desktop captures.
  Inspected pixels: titlebar, side panels, status bar, settings labels, light/dark
  text and unchanged page preview. Final captures include the full status bar.
- This runner has no Rust toolchain or Windows/macOS compositor. Native Rust
  compilation and true desktop blur are not verified here.

Before release: build Windows/macOS (including `--locked`), test both modes,
restart persistence, theme changes, rapid switching, high contrast, unsupported
Windows, maximize/drag/resize and macOS focus changes. Linux must stay opaque.
