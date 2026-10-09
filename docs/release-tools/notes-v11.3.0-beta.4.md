Beta pre-release. Not stable. Built from `somnia-agent` at 09e3a84 (CI 4/4 green, run 37937926874). The owner has not tested this build on a real desktop yet. It bundles everything since beta.3 and adds five Studios.

## Highlights
- Studios: the header pill now switches between Code, Documents, Slides, Sheets and Sound. Photos Develop lives inside the existing Photo editor.
- Documents Studio: DOCX editing on a WordCraft WASM engine. Edit text runs, type at the caret on the page, split and join paragraphs, with undo.
- Sheets Studio: spreadsheet editing with cell formatting, borders, merged cells and frozen panes.
- Slides Studio: PPTX preview with thumbnails and text editing. Saving writes a copy and keeps the original file and all unedited parts.
- Sound Studio: open MP3, WAV, FLAC, OGG and AIFF, edit regions (crop, cut, effects), reverse and more, save as WAV.
- Photos Develop (experimental): exposure, contrast and saturation with undo/redo inside the Photo editor, on a bounded JPEG/PNG engine.
- AI agent tools for Photos Develop, Slides and Sound: inspect, propose (staged only), reviewed apply, guarded undo. Nothing is applied without your review. See `docs/AGENT-TOOLS.md`.
- PDF: annotation creation, comment replies, and markup properties (colour, opacity and similar) with rotated-page handling.
- Sync folder for settings.
- Studio pill icons for Documents, Slides, Sheets and Sound.
- README rework and a dark-mode logo.

## Fixes
- Many CI and spec fixes, see the commit log. The Studio shell snapshot tolerance is temporarily raised (maxDiffPixels 1200) while snapshots are regenerated in CI.

## Known issues
- Nothing here is production-verified. The UI was checked in a real browser against mocked Tauri commands, not in the desktop app. Windows and macOS interactive behaviour is untested. Native paths (file grants, save dialogs for PPTX and WAV, sync folder, OS credential store) have only run through mocked IPC and Rust tests.
- The new Studios are first versions. Documents, Sheets and Slides edit a subset of their formats and keep the rest untouched or preview-only. Slide layouts and speaker notes are read-only. Photos Develop is experimental and has no RAW support. Sound has no live audio device test on Windows or macOS.
- The AI tools for Photos, Slides and Sound are wired as modules with tests. The review panel and the central panel wiring are not finished for every Studio yet, so do not expect a finished AI flow there. No live model provider was used.
- Sound uses Symphonia (MPL-2.0); the notice is in the third-party list.
- CI: `versions-panel.spec` is flaky (it failed twice and passed on rerun).
- Not in this beta: the colour themes, SVG stroke gradients and pen tool changes, a Windows "Open with Somnia" file association, a Video Studio. Extension repos are not published.
- macOS is Apple Silicon only, ad-hoc signed, not notarized. Windows installers are unsigned (SmartScreen warning). No auto-update metadata.
- Build requirements: Rust 1.95, the wasm32 target, wasm-bindgen, and `npm run craft:build` (builds all WASM engines from repo source, including `photos-engine` and `sound`).

## Install
- Windows: `x64-setup.exe` or `.msi`. macOS: `.dmg`. Linux: `.AppImage` or `.deb`.
- Does not replace stable v11.1.0 or the Microsoft Store package.

## Checksums
- `SHA256SUMS.txt` lists the SHA-256 of every installer. `macos-verification.txt` has the CI signature/image checks.
- CI: https://github.com/philppplik/somnia/actions/runs/37937926874 (native, macos, windows, frontend all passed).
- All WASM in this release was built by CI from repo source. No prebuilt WASM files from outside the repo are included.
