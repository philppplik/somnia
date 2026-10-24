# Sound Studio shell

Sound uses the shared shell panel contract. Its data manifest is `phase1/src/lib/studios/sound.ts`; component registration is `components/sound/registerShell.ts`. No Sound-specific branch is needed in the shell.

## Layout

- Left rail: Files, Audio clips, Selection. Audio clips opens by default. The searchable clip list switches the active audio tab and keeps its filter through `usePanelState`.
- Right rail: Audio inspector, Effects. The inspector opens by default and uses the generic `shell.inspector` host.
- Inspector sections: Source audio (duration, rate, channels, peak, RMS and output duration), Levels and fades (trim, reverse, fades, normalization), Processing (step summary, reset, original/edited listening, export).
- Effects panel: pitch, the offline plugin list, tail switch and plugin parameters.
- Selection panel: numeric start/end, select all, crop, cut, selection-only processing and region removal.

Rail order, pinning, hiding and overflow use the shared per-studio customization store. All defaults are pinned. Icons come from the rail icon registry; Files, AudioWaveform, Scissors, Volume2 and SlidersHorizontal keep their existing glyphs.

## Context and commands

The active Sound workspace claims an owner-safe context and reports document identity, non-neutral settings as dirty, selected original-time region, processing state and engine readiness. Code's inline audio preview does not claim the Sound context.

`lib/sound/commands.ts` registers twelve typed interactive commands. Registration is reference-counted because the canvas and inline preview can overlap during studio switches. The palette inventory includes these commands and their five locale titles. Payload schemas reject malformed settings, region modes, numeric values and extra top-level fields. Agent/MCP origins cannot execute these local UI commands.

| Command | Payload |
| --- | --- |
| `sound.clip.activate` | `{name}` |
| `sound.settings.set` | `{settings}` (complete SoundSettings) |
| `sound.settings.reset` | none |
| `sound.selection.set` | `{start,end}` (seconds of original audio) |
| `sound.selection.all`, `sound.selection.clear` | none |
| `sound.region.apply` | `{mode: "crop" | "cut" | "only"}` |
| `sound.region.clear` | none |
| `sound.listen` | `{version: "original" | "processed"}` |
| `sound.transport.toggle` | none |
| `sound.transport.seek` | `{seconds}` |
| `sound.export` | none |

The session still performs every render against the original bytes. Export writes a WAV copy through the existing native save dialog or browser download. Export is disabled while a debounce render is queued or processing, preventing a stale WAV from being saved immediately after a control change. There is no new DSP engine or fake production behavior.

## Verification

From `phase1`:

```sh
npx tsx --test src/lib/sound/commands.test.ts src/lib/sound/sound.test.ts src/lib/shell/*.test.ts
npm run check:ui-commands
npm run check:commands
npm run check:layers
npx tsc --noEmit
node scripts/sound-shell-screenshots.mjs
```

The screenshot script starts an isolated Vite harness, uses a mocked engine and exercises select all, crop/remove region, normalization, pitch, plugin parameters, clip filtering and queued-export disablement. It writes light and dark screenshots to `tests/artifacts/sound-shell` by default (override with `SOUND_SCREENSHOTS`). Set `SOUND_CHROME` to a Chrome executable when Playwright Chromium is not installed. The mock provides no real audio playback or DSP verification. The harness is a separate HTML entry; production `main.tsx` does not import it.

Known base limitations at a57d8a4: typechecking requires the missing generated Slides engine module; dependency-cruiser warns about TypeScript 7 transpiler support; real Sound WASM tests skip unless `sound/pkg` is built. Native save dialogs, Windows behavior and real playback need verification with built engines. The real-engine Sound E2E selectors now open the Selection/Effects rail panels and scope repeated `sound-controls` after migration; this suite was not run without built engines. Code's inline full controls remain available.
