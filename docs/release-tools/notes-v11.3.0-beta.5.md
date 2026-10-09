Beta pre-release. Not stable. Built from `somnia-agent` at 6d9a126 (CI 4/4 green, run 37967097525). The owner has not tested this build on a real desktop yet. It bundles everything since beta.4.

## Highlights
- Video Studio (6th Studio, Ctrl/Cmd+6): open WebM, MKV, MP4 or MOV, see probe metadata, play it, and build an edit on a multi-clip timeline. Split at the playhead, ripple-delete, reorder by drag or keyboard, trim clip edges, per-clip gain (0-200%) and mute. Export runs in a background worker, frame-accurate, with progress and cancel. Export is WebM (VP9 + Opus). MP4/H.264 is shown as disabled where the platform has no encoder for it. No ffmpeg; demux/mux uses mediabunny (MPL-2.0) and the browser's WebCodecs.
- Ten new colour themes in Settings: Forest Green (the old Forest Green choice now uses this palette, plus a light variant), Royal Purple, Slate Mono, Nord Frost, Crimson Red, Honey Amber, Ocean Blue, Sakura Pink, Sunset Orange, Lagoon Teal. Labels exist in all five languages.
- SVG editor: stroke gradients, stroke to path, PNG export, and a pen tool with continue-path, segment drag, anchor add/delete and Escape to finish or cancel.
- Ten example extensions in the repo under `phase1/examples/` (accessibility audit, SEO preflight, link check, heading outline, editorial metrics, TODO navigator, CSS variable inventory, locale parity, data workbench, form kit). They are read-only panel extensions. They are published to the extension catalog separately from this release.
- Docs: extension SDK chapters checked against the code, the agent tool pattern (`docs/AGENT-TOOLS.md`), OpenRouter and Ollama integration.

## Fixes
- Extension panels can no longer navigate their own frame away unnoticed: the host removes a panel frame on any second load, and the panel CSP now also blocks form submission and base changes. The earlier docs claim that panels had no network access was too strong and is corrected in `docs/extensions/07-security.md`.
- Several CI and spec fixes, see the commit log.

## Known issues
- **Extensions probably do not run in the desktop build.** Tests under the real production CSP show that the packaged app's CSP blocks the Blob workers and the inline bridge that extensions use. Browser tests do not show this. A fix (serving worker and panel documents with their own CSP) is planned and is not in this beta. Do not rely on extensions in the installed app.
- Nothing here is production-verified. The UI was checked in a real browser against mocked Tauri commands, not in the desktop app. Windows and macOS interactive behaviour is untested.
- Video Studio is a first version: no filmstrip thumbnails, titles or crossfades. Video export depends on the platform's WebCodecs encoders. Not tested on Windows or macOS.
- The AI tools for Photos, Slides and Sound exist as modules with tests; the review flow is not finished for every Studio.
- CI: several specs are flaky (`versions-panel`, a Ctrl+K palette timeout in `perf-large-projects` and `web-folder`, a typing race in `sheets-studio`, and the Video Studio specs on a cold dev server). The CI config now retries a failed spec once, which can hide flakes.
- The Studio shell snapshot tolerance is still temporarily raised (maxDiffPixels 1200).
- Not in this beta: a Windows "Open with Somnia" file association (issue #164).
- macOS is Apple Silicon only, ad-hoc signed, not notarized. Windows installers are unsigned (SmartScreen warning). No auto-update metadata.
- Build requirements: Rust 1.95, the wasm32 target, wasm-bindgen, and `npm run craft:build`.

## Install
- Windows: `x64-setup.exe` or `.msi`. macOS: `.dmg`. Linux: `.AppImage` or `.deb`.
- Does not replace stable v11.1.0 or the Microsoft Store package.

## Checksums
- `SHA256SUMS.txt` lists the SHA-256 of every installer. `macos-verification.txt` has the CI signature/image checks.
- CI: https://github.com/philppplik/somnia/actions/runs/37967097525 (native, macos, windows, frontend all passed).
- All WASM in this release was built by CI from repo source. No prebuilt WASM files from outside the repo are included.
