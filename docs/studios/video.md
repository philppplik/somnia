# Video Studio (packages 1 and 2)

Video files open as media tabs (mp4, m4v, mov, webm, mkv, content-sniffed) and are edited in the
Video Studio. Preview is the platform's own `<video>` element; container probing and the export
pipeline (`mediabunny` demux/mux, WebCodecs encode) run in a dedicated worker. The UI thread never
demuxes or encodes. The plan and the reasons behind the technology choices (why WebCodecs instead
of ffmpeg.wasm) live in [`VIDEO-PLAN.md`](VIDEO-PLAN.md).

## What ships in these packages

- Media kind `video` in the shared media store: ISO-BMFF sniffed by the `ftyp` major brand
  (qt → mov, M4V → m4v, everything else mp4), WebM/MKV by the EBML magic plus the DocType in the
  header (`src/lib/video/format.ts`). A renamed file is still recognised; junk is rejected before
  a tab opens.
- Studio manifest `src/lib/studios/video.ts` (pill glyph Film from the Vadivam set, Files rail,
  automatic routing with manual precedence, shortcut Mod+6 as the sixth registered studio).
- **Multi-clip timeline** (`src/lib/video/timeline.ts`): every video tab owns an ordered,
  gap-free edit list. A clip is a source-time range of any opened video, with per-clip gain
  (0-200 %) and mute. Edits are pure functions - split at a timeline time, ripple delete, reorder,
  trim either edge - so the whole model is unit-tested without a browser.
- Workspace (`src/components/video/`): player with transport (play/pause, frame step at the
  probed frame rate, seek, volume, mute), the segmented timeline (one block per clip, drag to
  reorder, edge handles trim the selected clip, playhead seeks) and keyboard-first editing:
  Space/←/→ transport, I/O trims the clip under the playhead, S splits, Delete ripple-removes the
  selected clip, Alt+←/→ moves it, M mutes it. Preview plays the edit itself: one `<video>`
  element per source, advancing across clip boundaries and retimestamped onto the timeline clock.
- Inspector: probed facts of the root source, the timeline panel (clip count, total duration,
  add-clip picker over opened videos plus "Add from file…", which opens, appends and returns to
  the project tab), the selected-clip panel (source range numerics, gain slider, mute, move and
  remove) and the capability-honest format choice. Encoder support is probed with WebCodecs
  (`getFirstEncodable*`) per output size: WebM (VP9/VP8 + Opus) is the baseline, MP4 (H.264)
  appears only where the platform can encode it, and where no AAC encoder exists the MP4 entry
  says so and exports video-only - never a silent audio loss.
- Export (`src/lib/video/pipeline.ts`): the timeline renders clip by clip - `CanvasSink` decodes
  each source range and letterboxes it to the first clip's dimensions (`fit: 'contain'`), a single
  `CanvasSource` re-encodes every frame on the timeline clock; audio runs through
  `AudioSampleSink`/`AudioSampleSource` with mediabunny's resample/remix transform to 48 kHz
  stereo, per-clip gain applied per sample, muted clips contributing silence. Progress is real
  (processed timeline seconds) and cancellable. The result downloads as `<name>-edited.webm|mp4`
  (`-copy` for an untouched single clip).
- Session store (`src/lib/video/session.ts`) with the Sound pattern: per-tab sessions, engine
  factory replaceable in tests, media-sync close, object-URL hygiene. Concurrent opens of the
  same source share one in-flight probe, so adding a clip whose tab is still probing cannot race.
  Original bytes are never touched; the exported copy is the only materialized result.

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
- Preview is a live preview of the edit, not a frame-exact render: clip boundaries can cost a
  beat while the element swaps sources, and per-clip gain is export-only (the preview keeps
  element volume). Thumbnails and title clips are later packages (`VIDEO-PLAN.md`).
- Mixed resolutions are letterboxed to the first clip's dimensions; mixed frame rates stay
  variable-rate. A clip whose source tab was closed renders as "missing" and blocks the export
  with a clear message instead of failing midway.
- Export speed depends on the platform's hardware encoders; progress is real and cancellable.
- On the desktop app the export is a download in this package; the native save dialog
  (`video_save_*` grants modelled on `audio_save_*`) is package 5.

## Licensing

mediabunny is MPL-2.0 (file-level copyleft, used unmodified); its notice ships through
`src/lib/thirdParty.json`, same as the MPL `symphonia-*` crates in the Sound engine. No codec
bytes ship: encoding is the operating system's (WebCodecs). ffmpeg.wasm was rejected because
`@ffmpeg/core` is GPL-2.0-or-later.

## Tests

- `src/lib/video/video.test.ts`: sniffing on real fixtures and synthetic brands, the timeline
  model (ranges/locate/split math, ripple delete, reorder, edge clamping, sanitize), download
  naming, real mediabunny probes of the fixtures (Node), and the full session lifecycle against a
  fake engine (open, add, trim, split, move, gain, mute, export, cancel, error, reset, close) -
  including which sources and clips reach the worker.
- `tests/video-studio.spec.ts` (Playwright): open/play/trim/export round trip with a downloaded
  WebM that is sniffed and re-probed for its trimmed duration, the H.264 no-preview honesty test,
  junk rejection, Code-studio inline mode, the multi-clip flow (add from file, split, ripple
  delete, reorder, mute and gain, joined export re-probed for the timeline duration) and all four
  non-English locales. Fixtures
  (`tests/assets/clip.webm`, `clip.mp4`) are 2-second synthetic clips generated with the local
  ffmpeg binary - test tooling only, nothing of it ships.
