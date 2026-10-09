# Video Studio: architecture and package plan (target: v11.3.0-beta.5)

The Video Studio is the next registered Studio after Sound (`docs/studios/sound.md` is the reference
integration). It turns Somnia's creative suite toward motion: video files open as media tabs and are
edited in a dedicated workspace, with the same shell rules as every other Studio - additive touch
points, no placeholders, original files never modified.

## Scope decisions (why it is built this way)

- **Preview is the native `<video>` element** fed by the media blob URL. No decoder ships for
  preview; whatever the platform (WebView2/Chromium on Windows, WKWebView on macOS, the browser on
  the web) can play, the Studio plays.
- **Container reading and writing use `mediabunny`** (pure TypeScript, MPL-2.0 - the same
  file-level-copyleft situation as the `symphonia-*` crates in the Sound engine, so its notice joins
  `src/lib/thirdParty.json`). It probes duration/tracks/dimensions/frame rate, demuxes for export
  and muxes the result. No custom MP4 box parser is invented.
- **Export runs on WebCodecs in a dedicated worker** (VideoDecoder/VideoEncoder,
  AudioDecoder/AudioEncoder) with `mediabunny` as muxer. `ffmpeg.wasm` was evaluated and rejected:
  `@ffmpeg/core` carries GPL-2.0-or-later (libx264), which conflicts with the MIT codebase and with
  the licensing care already applied to Sound (no LGPL MP3 encoders). WebCodecs uses the operating
  system's own codecs, is hardware accelerated and ships zero codec bytes.
- **Capability-honest UI.** Encoder configurations are probed (`VideoEncoder.isConfigSupported`,
  `AudioEncoder.isConfigSupported`) and the export dialog only offers what the current platform can
  really produce. WebM (VP9/VP8 + Opus) is the always-offered baseline on Chromium. MP4 (AVC/H.264)
  is offered for video; AAC audio is included only where the platform has an AAC encoder (macOS),
  otherwise the MP4 choice is clearly marked "video only" - never a silent audio loss.
- **No Rust crate in this Studio.** There is no license-clean H.264 decoder in the Rust ecosystem;
  WebCodecs already runs natively. The worker/protocol/session pattern from Sound is kept
  (`protocol.ts`, `worker.ts`, `engine.ts`, `session.ts`, fake engine in unit tests), minus the
  WASM init step.
- **Non-destructive edit list.** Edits are a recipe (trim range first, more steps per package).
  Preview plays the original, narrowed to the trim range while one is set; the exported copy is the
  only materialized result. Undo of an edit is a recipe change, not a re-encode.

## Package plan

1. **P1 - open, play, trim, export** (this package)
   - Media kind `video`: mp4, m4v, mov (ISO-BMFF `ftyp`, brand-aware), webm, mkv (EBML,
     DocType-aware), content-sniffed like every other media kind.
   - Studio manifest `video` (pill glyph, rail, hosts, automatic routing with manual precedence,
     shortcut Mod+6), media store + drop/open-dialog accept lists, `uiContext` media-readonly
     mapping, inline workspace when Code is chosen manually.
   - Workspace: player with transport (play/pause, seek, frame step, rate), timeline bar with
     playhead and draggable in/out trim handles, I/O keys, inspector with probed clip facts, trim
     numerics and the export panel (format choice, progress, cancel).
   - Export: trim-accurate re-encode to WebM (VP9+Opus) and MP4 (AVC, AAC where supported),
     download on web and desktop P1; native save dialog is P5.
   - Five locales, unit tests (sniffing, recipe, session with fake engine, probe), Playwright E2E
     with screenshots on generated fixtures (the local ffmpeg binary is a test-tooling detail only;
     nothing of it ships).
2. **P2 - multi-clip timeline**: several sources in one project, split at playhead, ripple delete,
   reorder, per-clip mute/gain, keyboard-first editing.
3. **P3 - filmstrip and titles**: WebCodecs still thumbnails on the timeline, title/text overlay
   clips, crossfade transitions.
4. **P4 - agent tools**: `video_inspect` / `video_propose_edits` as a module (not wired into
   `panelBridge.ts`; the integrator owns that shared file, exactly like Sound P4).
5. **P5 - desktop pass**: native save dialog (`video_save_pick`/`video_save_write` grants modelled
   on `audio_save_*`), Windows verification, timeline accessibility hardening.

## Honest limits (P1)

- The shared media store caps files at 25 MB; larger videos are rejected with a clear message
  (same rule as Sound).
- MKV opens for probe/export where the browser cannot play it for preview; the workspace says so
  instead of pretending.
- Preview shows the original (narrowed to the trim range). Visual effects land in P3; the exported
  copy is the single source of rendered truth.
- Encoding speed depends on the platform's hardware encoders; progress is real (per processed
  second) and cancellable.
