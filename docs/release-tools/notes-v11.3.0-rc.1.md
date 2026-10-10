Release candidate. Built from `somnia-agent` at <SHA> (CI 4/4 green, run <RUN>). Bundles everything since beta.5. If no blocking issue is found, this content becomes stable 11.3.0 after the owner's explicit decision.

## Highlights
- Photos Studio (9th Studio, Ctrl/Cmd+9): develop settings, preview and export through a WASM worker, session and inspector, in all five languages. PNG and the other raster formats open here directly.
- Video Studio P3: filmstrip thumbnails, title cards, and crossfade transitions with exact linear-dissolve compositing; frame sync while paused.
- PDF: bounded read-only content import with thumbnails, an additive metadata edit model with a copy exporter and localized inspector, and an explicit flattened-copy export pipeline with a capability panel. PDFs that reference the non-embedded base-14 fonts, CJK CMaps or JBIG2/JPX images now render correctly because the pdf.js standard fonts, CMaps, ICC profiles and WASM decoders ship with the app.
- Sheets Studio: range selection, TSV copy/cut/paste, a dirty close guard and native save-as-copy.
- Extensions now run in the desktop build: worker and panel documents are served from their own somnia-ext scheme with their own strict CSP (this was the top known issue of beta.5). A navigation away from a panel drops all authority.
- Somnia as an MCP server: the agent panel can start a loopback MCP gateway; clients connect with a per-app token shown in Settings, and MCP tool calls are validated and reviewed as proposals in the agent panel before anything executes.
- Studio shell: nine Studios with unique pill order and Mod+1..9 shortcuts, capability-driven mode contract with per-document Code mode memory, blank local documents and empty video timelines from the starters.
- Windows: the installer registers "Open with Somnia" for html, svg, css, md, docx, xlsx, pptx, pdf and common image, audio and video formats (no default-app takeover), and a file opened this way routes into the right Studio (#164).
- New Somnia app icon and mark.
- Extension security hardening: a local reinstall that adds permissions installs disabled (re-enable consciously), per-extension storage keys are capped and collision-safe, hung extension workers are terminated on timeout, and prototype method names are rejected by the API gate.

## Fixes
- Photos no longer claims preview-only raster formats (bmp/ico/tga/tiff/qoi/gif/ppm/avif stay in the media preview).
- Extension panel session is created inside the effect so React StrictMode cleanup cannot leave a disposed session.
- Several CI and spec fixes, see the commit log.

## Known issues
- Nothing here is production-verified. The UI was checked in a real browser against mocked Tauri commands, not in the desktop app. Windows and macOS interactive behaviour is untested; the Windows checklist (docs/release-tools/windows-checklist.md) now includes the file-association checks.
- File associations: a second launch while the app is already running is not forwarded (no single-instance plugin yet). Explorer registration itself must be verified on a real Windows install.
- The connect-src policy still allows ws:/wss: to any host because LAN collaboration guests join arbitrary ws:// hosts by design (accepted risk, pending owner decision).
- CI: some specs remain flaky; the CI config retries a failed spec once, which can hide flakes.
- The example extension repositories (link-atlas, content-lens, metadata-preflight, token-scout, email-craft) are not published yet.
- The Sheets engine fetches GridCraft from the upstream repository at a pinned commit; a mirror under the owner's account is still missing (token cannot fork or create repos, owner action needed).
- macOS is Apple Silicon only, ad-hoc signed, not notarized. Windows installers are unsigned (SmartScreen warning). No auto-update metadata.
- Build requirements: Rust 1.95, the wasm32 target, wasm-bindgen, and `npm run craft:build` (now also builds the isolated pdf-craft spike).

## Install
- Windows: `x64-setup.exe` or `.msi`. macOS: `.dmg`. Linux: `.AppImage` or `.deb`.
- Does not replace stable v11.1.0 or the Microsoft Store package.

## Checksums
- `SHA256SUMS.txt` lists the SHA-256 of every installer. `macos-verification.txt` has the CI signature/image checks.
- CI: https://github.com/philppplik/somnia/actions/runs/<RUN> (native, macos, windows, frontend all passed).
- All WASM in this release was built by CI from repo source. No prebuilt WASM files from outside the repo are included.
