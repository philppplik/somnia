# Sound clip gain automation (D1)

Status: implementation slice, headless-tested. No new dependency. D2 (proposal review mount) is parked pending the shell owner; recording/codecs/streaming stay out.

## What changed

Arrange clips carry a gain curve: up to 32 automation points per clip, each a clip-local frame and a level in dB (-60 to +12). The mix interpolates linearly in dB between points, holds the outer values outside the point range and multiplies the result into the existing fade envelope, so static gain, fades and automation compose in one per-frame factor. Track/master racks, tails, ranges and mastering inherit the automated mix unchanged (the rack pipeline renders the same per-track PCM).

The document is schema v4. Versions 1-3 migrate with neutral empty curves; clips, timing, gains, fades and racks are untouched. Validation stays strict: point limit, dB range, clip-local bounds and duplicate positions are rejected; unsorted input is sorted deterministically. Splitting a clip re-bases the curve like fades: both halves carry the interpolated cut level at the boundary, so the ramp continues seamlessly. Curve edits are atomic undoable history via `sound.arrange.clip.curve`, and the inspector adds points at the playhead with per-point dB edits and delete.

## Honest limits

- Segment shapes are linear, hold or ease (see below); no free bezier handles.
- Automation is clip-local; no track-level or master automation lanes.
- Points are whole frames (48 kHz), displayed and edited numerically; no freehand lane drawing.
- Migration re-validation is the single authority: a malformed stored curve fails the document instead of being silently dropped.

Roadmap-Delta D1: per-clip gain automation in the bounded session mixer. No new DSP, dependencies, real-time parameter ramps or Stage-D-beyond-scope claims.

## Curve shapes (sound studio upgrade, schema v15)

Every automation point (clip gain, clip pan, track gain, track pan, master gain) can carry a `shape` that describes the segment from that point to the next one: `linear` (default), `hold` (step: keeps the value until the next point), or `ease` (smoothstep, slow start and end, no overshoot). The last point's shape is unused. Linear is stored as an absent key, so every v14 document is valid unchanged and migration 14 to 15 only bumps the version; older builds cannot open v15 files that use shapes (strict validation rejects the unknown field, it does not drop it). The point row in each lane has a shape select.

Splitting a clip, trimming its start or end and cut-range keep the shapes of retained points; the new first point of a right half inherits the shape of the segment it was cut from. The level at a cut is continuous. Cutting inside an `ease` segment re-eases each half between its own endpoints, so the curve inside that one segment is not identical to the original.

Evaluation is one shared function per lane type (`curveDbAt`, `curvePanAt`), so mix, freeze, glue, analysis and export all agree. Tests: `curveShape.test.ts`.
