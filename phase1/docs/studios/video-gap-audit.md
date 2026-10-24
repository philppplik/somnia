# Video Studio - gap audit against everyday editing workflows

Written after the V17-V34 slice run (overlays, PiP, voiceover, crop, rotation, gain, handles). Scope: what an
everyday short-form / social / family-video editor expects, checked against the actual codebase state.

## What the studio already covers (verified in code)

- Gap-free multi-clip timeline: split, trim, move, duplicate, swap source, replace, ripple-safe edit list
- Crossfade (dissolve) between clips with equal-power audio, freeze frames, image clips with set duration
- Title clips and an overlay track: titles, images, and PiP video overlays with rect, opacity, gain, source start
- Audio track: gain, fades, ducking, mute, voiceover recording with mic permission
- Per-clip speed 0.25x-4x, rotation in quarter turns, flip, crop/zoom, per-clip gain and audio fades
- JKL shuttle, loop playback, snapping, timeline zoom, filmstrip thumbnails, waveform strips
- Undo/redo with history keys, project files (v2), mp4/webm export with quality/scale/fps options and ranges

## Gaps, prioritized by everyday value

### 1. Subtitle import (SRT/VTT) -> title overlays - HIGH value, SMALL effort

Everyday captioning today means placing each title overlay by hand. A parser that maps SRT/VTT cues to title
overlays (at/duration from cue times, text from cue body, lower-third default) is a pure model feature:
`subtitles.ts` (parse + sanitize), one inspector button, one command. Auto-transcription stays out of scope
($0 budget, no API). Estimated: 1 slice, ~10 unit tests.

### 2. Export aspect presets (9:16, 1:1, source) - HIGH value, MEDIUM effort

Output dimensions derive from the first clip's probe times the scale option; there is no way to render a
vertical reel from horizontal footage. Everyday social workflows need 9:16 and 1:1. The change is a format
option (`aspect?: 'source'|'16:9'|'9:16'|'1:1'|'4:5'`) resolved before outW/outH, with contain-fit letterboxing
or crop-to-fill per clip. Touches pipeline size math, export options UI, project file, report strings.
Estimated: 1-2 slices.

### 3. Text animations for titles/overlays - MEDIUM value, MEDIUM effort

TitleSpec has opacity fades only. Everyday titles slide or rise. Additive: `animate?: 'none'|'rise'|'slide-left'`
on TitleSpec, evaluated in drawTitleCard (position offset over the fade window). Preview and export share the
card code, so one implementation covers both. Estimated: 1 slice.

### 4. More transitions (wipe, slide) - MEDIUM value, MEDIUM effort

Only the dissolve crossfade exists; `crossfade_s` overlaps tails. Wipes/slides need a clip-pair transition type
(`transition?: {kind:'fade'|'wipe-left'|...; s:number}`) evaluated in the fade-zone renderer with directional
masks. Each kind is small once the plumbing exists. Estimated: 1 slice plumbing + 1 slice per 2-3 kinds.

### 5. Reverse playback - NICHE value, HIGH effort

Speed is clamped to 0.25x-4x positive. Export-side reverse is possible (backward frame stepping via repeated
getCanvas with decreasing timestamps, audio reversed in the buffered mixer path), but preview has no negative
playbackRate in HTMLVideoElement; a preview would need manual frame stepping. Honest recommendation:
export-only reverse as one slice, preview shows a "reverse renders on export" badge.

### 6. Keyframed motion (position/opacity over time) - HIGH value, LARGE effort

The general case behind animated lower thirds and zoom-pan (Ken Burns). Requires a keyframe model on overlays
and clips, evaluation in both renderers, and an editing UI. Worth doing only after 1-3 land; the overlay rect
model is already the right shape for it.

## Deliberately out of scope

- Auto-transcription, stock media, AI features: $0 budget, no external APIs.
- Multitrack video beyond the overlay track: the overlay track covers PiP/lower-thirds; full N-track editing is
  a different product shape.
- Loudness normalization (EBU R128): the mixer would need a measurement pass; nice-to-have, not everyday.
