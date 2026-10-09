# Video Studio (first package)

Video files open as media tabs (mp4, m4v, mov, webm, mkv, content-sniffed) and are edited in the
Video Studio. Preview is the platform's own `<video>` element; container probing and the export
pipeline (`mediabunny` demux/mux, WebCodecs encode) run in a dedicated worker. The UI thread never
demuxes or encodes. The plan and the reasons behind the technology choices (why WebCodecs instead
of ffmpeg.wasm) live in [`VIDEO-PLAN.md`](VIDEO-PLAN.md).

## What ships in this package

- Media kind `video` in the shared media store: ISO-BMFF sniffed by the `ftyp` major brand
  (qt → mov, M4V → m4v, everything else mp4), WebM/MKV by the EBML magic plus the DocType in the
  header (`src/lib/video/format.ts`). A renamed file is still recognised; junk is rejected before
  a tab opens.
- Studio manifest `src/lib/studios/video.ts` (pill glyph Film from the Vadivam set, Files rail,
  automatic routing with manual precedence, shortcut Mod+6 as the sixth registered studio).
- Workspace (`src/components/video/`): player with transport (play/pause, frame step at the
  probed frame rate, seek, volume, mute), a timeline ruler with playhead and draggable trim
  handles (pointer and keyboard, ARIA sliders), I/O keys set the trim at the playhead, and an
  export button. While a trim is set, playback loops inside the cut so the range under review is
  exactly what gets exported.
- Inspector: probed clip facts (duration, dimensions, frame rate, video and audio codec, channels,
  sample rate), trim numerics, mute-audio edit, and the capability-honest format choice. Encoder
  support is probed with WebCodecs (`getFirstEncodable*`) per clip size: WebM (VP9/VP8 + Opus) is
  the baseline, MP4 (H.264) appears only where the platform can encode it, and where no AAC
  encoder exists the MP4 entry says so and exports video-only - never a silent audio loss.
- Export (`src/lib/video/pipeline.ts`): a frame-precise re-encode of the trim range
  (`Conversion` with `copy: false`, quality HIGH), progress in percent and processed seconds, and
  real cancellation (`Conversion.cancel`). The result downloads as `<name>-trimmed.webm|mp4`
  (`-copy` when nothing was edited, `-edited` for edits without a trim).
- Session store (`src/lib/video/session.ts`) with the Sound pattern: per-tab sessions, engine
  factory replaceable in tests, media-sync close, object-URL hygiene. Original bytes are never
  touched; the exported copy is the only materialized result.

## Shell touch points (all additive)

| File | Change |
|---|---|
| `lib/studios/index.ts` | `import './video'` and export |
| `components/studios/hosts.tsx` | `video.canvas` and `video.inspector` entries |
| `components/studios/StudioGlyph.tsx` | Film glyph |
| `lib/media.ts` | media kind `video`, extensions, accept list, sniffing |
| `lib/uiContext.ts` | video media maps to domain `media-readonly` |
| `components/MediaPreview.tsx` | `video` branch renders the Video workspace (with inline settings when the Code studio is chosen manually) |
| `lib/i18n.ts` | merges `locales/video/*.json` (studio-owned strings, 5 languages) |
| `lib/icons.tsx` | Film, ChevronsLeft/Right, Volume2/VolumeX (Vadivam) |
| `lib/commands.ts` | studio shortcuts now cover the first six studios (Mod+6 for Video) |
| `lib/thirdParty.json`, `package.json` | mediabunny (MPL-2.0) dependency and notice |
| `package.json` `test:core` | `src/lib/video/*.test.ts` joins the core suite |

No Rust crate, no WASM build step, no CSP change: the existing `media-src 'self' blob:` covers
video playback, and mediabunny is plain TypeScript.

## Honest limits (this package)

- The shared 25 MB media cap applies; larger videos are rejected with a clear message.
- A clip the platform cannot play (H.264 MP4 in a codec-free Chromium, MKV almost everywhere)
  still opens: probing and export work, and the workspace says plainly that preview is not
  possible instead of showing a black square.
- Preview shows the original, narrowed to the trim range. Effects, multi-clip timelines and
  thumbnails are later packages (`VIDEO-PLAN.md`).
- Export speed depends on the platform's hardware encoders; progress is real and cancellable.
- On the desktop app the export is a download in this package; the native save dialog
  (`video_save_*` grants modelled on `audio_save_*`) is package 5.

## Licensing

mediabunny is MPL-2.0 (file-level copyleft, used unmodified); its notice ships through
`src/lib/thirdParty.json`, same as the MPL `symphonia-*` crates in the Sound engine. No codec
bytes ship: encoding is the operating system's (WebCodecs). ffmpeg.wasm was rejected because
`@ffmpeg/core` is GPL-2.0-or-later.

## Tests

- `src/lib/video/video.test.ts`: sniffing on real fixtures and synthetic brands, recipe
  clamping/naming, real mediabunny probes of the fixtures (Node), and the full session lifecycle
  against a fake engine (open, edit, export, cancel, error, close).
- `tests/video-studio.spec.ts` (Playwright): open/play/trim/export round trip with a downloaded
  WebM that is sniffed and re-probed for its trimmed duration, the H.264 no-preview honesty test,
  junk rejection, Code-studio inline mode and all four non-English locales. Fixtures
  (`tests/assets/clip.webm`, `clip.mp4`) are 2-second synthetic clips generated with the local
  ffmpeg binary - test tooling only, nothing of it ships.
