# Sound: live playback meter

## What it does
While the rendered mix plays in the arrange view, a peak meter next to the player shows the live level: a bar on a -60..0 dB scale plus the numeric dB value. It taps the playback element through the Web Audio API (`MediaElementSource` -> `AnalyserNode`) when playback starts and releases the audio context on unmount; pausing resets the meter to silence.

## Files
- `src/lib/sound/meter.ts` — pure meter math: per-frame peak, smoothed level with fast attack / slow release, dB conversion, bar fill.
- `src/components/sound/SoundLiveMeter.tsx` — the meter component (owns the Web Audio graph and the animation loop), rendered from `SoundArrange.tsx` next to the player.

## Test
`meter.test.ts` (3) covers peak detection, attack/release smoothing and decay to silence, and the dB/bar mapping. Full sound suite: 125 pass / 0 fail.

## Note
Browser-native Web Audio only, no new dependency. The meter measures the audible post-master signal, matching what the user hears. A failed tap (e.g. the element is already routed elsewhere) degrades silently to no meter.
