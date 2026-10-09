# Sound Studio (first package)

Audio files open as media tabs (mp3, wav, flac, ogg/oga, aif/aiff, content-sniffed) and are edited in the Sound Studio.
The engine is the headless SoundCraft core (`soundcraft-audio-io` decode/encode, `soundcraft-dsp` offline processing), compiled to WASM and run in a worker. The UI thread never decodes or renders audio.

## What ships in this package

- `phase1/sound/`: isolated Rust crate `somnia-sound` (own workspace, Rust 1.95, wasm-bindgen 0.2.129, like `craft/`). SoundCraft is pinned by git revision (`c51e5d5`, v0.3.0). Derived from the SoundCraft wasm spike; adds a lock file, 6 native tests on a real MP3 fixture, NOTICE, licence texts and a dependency inventory.
- `npm run sound:build` (also part of `npm run craft:build`, so every CI job and release build gets it). The wasm lands in `sound/pkg/` (git-ignored except the `.d.ts`).
- `src/lib/sound/`: protocol, worker, engine, recipe (settings to engine recipe), session store, format sniffing, i18n.
- `src/components/sound/`: canvas (start screen, waveform with original and edited overlay, A/B listening, transport, export WAV) and inspector (selection, trim silence, reverse, pitch, effect + reverb tail, fades, normalize, reset).
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
| `src-tauri/build.rs`, `src-tauri/capabilities/editor.json`, `src-tauri/src/desktop.rs`, `src-tauri/src/lib.rs`, new `src-tauri/src/audio_io.rs` | Paket 2: `audio_save_pick` / `audio_save_write` (native save dialog, one-time token, atomic WAV write), modelled on `pdf_save_*`; one `AudioGrants` state, two handler entries, one `mod` line |
| `package.json`, `scripts/check-craft.mjs`, `scripts/licenses.mjs`, CI | build chain, asset check, licence inventory, native crate tests |

## Selection and save (Paket 2)

Drag on the waveform (or keys `I` / `O` at the playhead, `Esc` clears) to select. The inspector offers Crop, Cut, and Edit selection only (the other steps run on the selection and are spliced back). One region per clip, in original-clip seconds, applied before all other steps (`Recipe.region`). Crop and Cut lock the selection; "Undo and adjust" removes the region. Save as WAV opens the OS save dialog in the desktop app (`audio_save_*`); on the web it is a download.

## Progress and plugin parameters (Paket 3)

The engine reports each stage (decode, region, trim, reverse, pitch, plugin, fade, normalize, encode) right before it starts (`run_with`, `process_with_progress`); the worker forwards it and the status line and a progress bar show "stage (n/m)". Granularity is per stage: a single slow stage (pitch shift on a long file) shows no inner percentage. The worker timeout is now 10 minutes.
Plugins are listed with their parameter metadata (`list_plugins`: id, range, default, unit, taper, choices). The inspector renders one control per parameter (log taper aware, choice and toggle types); only values that differ from the default enter the recipe. Parameter names come from the DSP crate and are English. The step summary under the controls is localized from the engine's step lines (`lib/sound/steps.ts`).

## Agent tools (Paket 4, module only, not yet live)

`lib/agent/soundStudio.ts`: the native-AI "document" of a clip is its edit settings as JSON (never audio bytes). Tools: `sound_inspect` (read: clip facts, settings, last render stats, effects with parameter ranges) and `sound_propose_settings` (propose: partial settings merged into the current ones, strictly validated, staged for review, never applied). `parseSound` rejects unknown keys, out-of-range values, unknown effects/parameters and bad regions instead of clamping silently. `lib/agent/soundWorkspace.ts`: settings text of open clips, `applySound` through the session store, `undoSound` only when it is the newest AI change and nothing was edited since.
Shared-file touch (additive): `documentCore.ts` gets `'sound'` in `StudioKind` and audio extensions in `studioFor`.
Not wired yet: `panelBridge.ts` still handles Code and Photo only. Needed there: `soundAdapter` in the `DocumentRegistry`, `soundFiles()` in `syncDocuments`, a sound branch in the transaction port (`hold`, `apply`, `undo`), `createSoundStudioRegistry` in `createTools`, `nativePath` for sound, and 'sound' in the studio-kind allow-list of the run start. Left out on purpose because that file is shared and security-sensitive and other studios are changing it.

## Licensing

SoundCraft is MIT OR Apache-2.0 (copyright line kept in `sound/NOTICE`; brand files and the ArtCraft name are not used). The 16 `symphonia-*` crates are MPL-2.0 (file-level copyleft, linked unmodified); their notice ships through `src/lib/thirdParty.json`. No MP3 encoder is included (shine-rs and LAME are LGPL): export is WAV only.

## Measured (spike numbers, x86_64 Linux sandbox, one run)

wasm 1.5 MB raw in this build; 3.5 s stereo MP3 decode + trim + normalize 20-40 ms; plate reverb with tail about 100 ms; pitch +7 st 200-390 ms (about 10-17x realtime, the slow step, so a 3-minute track needs several seconds).

## Not in this package (rest plan)

1. Wire the agent tools into `panelBridge.ts` (see above) plus a review view for sound proposals (settings diff and an audible preview of the proposed render).
2. Copy/paste of regions and several regions per clip (Paket 2 has one region: crop, cut, or effects only on the selection).
3. Writing back into the project folder. Media is not part of the project text-file store, so Save As (native dialog on desktop, download on web) is all that exists.
4. True streaming and an inner progress percentage for long single stages (progress is per stage today; 25 MB media limit, full offline render).
5. Encoders beyond WAV (FLAC/OGG) after a licensing decision for each.
6. Recording, multitrack and session/mixer from SoundCraft (not part of the spike scope).
7. A Windows desktop pass: media-src CSP, blob fetch under connect-src, audio output device.
