# Sound Studio (first package)

Audio files open as media tabs (mp3, wav, flac, ogg/oga, aif/aiff, content-sniffed) and are edited in the Sound Studio.
The engine is the headless SoundCraft core (`soundcraft-audio-io` decode/encode, `soundcraft-dsp` offline processing), compiled to WASM and run in a worker. The UI thread never decodes or renders audio.

## What ships in this package

- `phase1/sound/`: isolated Rust crate `somnia-sound` (own workspace, Rust 1.95, wasm-bindgen 0.2.129, like `craft/`). SoundCraft is pinned by git revision (`c51e5d5`, v0.3.0). Derived from the SoundCraft wasm spike; adds a lock file, 6 native tests on a real MP3 fixture, NOTICE, licence texts and a dependency inventory.
- `npm run sound:build` (also part of `npm run craft:build`, so every CI job and release build gets it). The wasm lands in `sound/pkg/` (git-ignored except the `.d.ts`).
- `src/lib/sound/`: protocol, worker, engine, recipe (settings to engine recipe), session store, format sniffing, i18n.
- `src/components/sound/`: canvas (start screen, waveform with original and edited overlay, A/B listening, transport, export WAV) and inspector (trim silence, reverse, pitch, effect + reverb tail, fades, normalize, reset).
- Studio manifest `src/lib/studios/sound.ts`, registered additively next to `code`.
- Original files are never modified. Every edit renders a copy; playback and export use the same rendered WAV.

## Shell touch points (all additive)

| File | Change |
|---|---|
| `lib/studios/index.ts` | `import './sound'` and export |
| `components/studios/hosts.tsx` | `sound.canvas` and `sound.inspector` entries |
| `components/studios/StudioPill.tsx` + new `StudioGlyph.tsx` | per-studio glyph map (was a hard-coded code icon) |
| `lib/media.ts` | media kind `audio`, extensions, sniffing |
| `lib/uiContext.ts` | audio media maps to domain `media-readonly` |
| `components/MediaPreview.tsx` | `audio` branch renders the Sound workspace (with inline settings when the Code studio is chosen manually) |
| `lib/i18n.ts` | merges `locales/sound/*.json` (studio-owned strings, 5 languages) |
| `lib/icons.tsx` | AudioWaveform, Pause, Download (Vadivam) |
| `src-tauri/tauri.conf.json` | CSP `media-src 'self' blob:` (needed for blob audio playback in the desktop app) |
| `package.json`, `scripts/check-craft.mjs`, `scripts/licenses.mjs`, CI | build chain, asset check, licence inventory, native crate tests |

## Licensing

SoundCraft is MIT OR Apache-2.0 (copyright line kept in `sound/NOTICE`; brand files and the ArtCraft name are not used). The 16 `symphonia-*` crates are MPL-2.0 (file-level copyleft, linked unmodified); their notice ships through `src/lib/thirdParty.json`. No MP3 encoder is included (shine-rs and LAME are LGPL): export is WAV only.

## Measured (spike numbers, x86_64 Linux sandbox, one run)

wasm 1.5 MB raw in this build; 3.5 s stereo MP3 decode + trim + normalize 20-40 ms; plate reverb with tail about 100 ms; pitch +7 st 200-390 ms (about 10-17x realtime, the slow step, so a 3-minute track needs several seconds).

## Not in this package (rest plan)

1. Agent tools for the Sound Studio (manifest `agent.tools` is empty): inspect, propose recipe, preview.
2. Selections and region edits (cut, copy, paste, per-region effects). The engine recipe is whole-clip.
3. Save to disk through the desktop save dialog (export is a browser download today) and writing back into a project folder.
4. Plugin parameters UI (the engine accepts a parameter map; the UI uses defaults).
5. Streaming playback and progress for long files (currently a full offline render, 25 MB media limit).
6. Encoders beyond WAV (FLAC/OGG) after a licensing decision for each.
7. Recording, multitrack and session/mixer from SoundCraft (not part of the spike scope).
8. A Windows desktop pass: media-src CSP, blob fetch under connect-src, audio output device.
