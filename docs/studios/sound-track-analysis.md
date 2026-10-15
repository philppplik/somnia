# Sound per-track analysis (D3)

Status: implementation slice, headless-tested. No new dependency. The B2 measurement rules (revision-bound, frozen, labelled unverified) are unchanged.

## What changed

The analysis panel has an explicit source select: Full mix or any session track. A track analysis renders only that track in the mix worker: its own inserts, level and pan apply; mute/solo are cleared for the analysis; the master chain and all other tracks are excluded. Sources, markers, loop, the C1 tail and the C3 output range behave exactly as in the full render, so durations match. The report binds to the session revision and is invalidated by any edit; a failed analysis is retried only after the source or revision changes, not in a loop. Selecting Full mix shows the existing render-bound report without an extra render.

## Honest limits

- A track analysis is its own worker render of the current session, not a tap of a live playback stream; there is still no live analyser.
- Missing WASM keeps the spectrum/sample peak real and loudness/true peak explicitly unavailable, as in B2. Rack errors fail the analysis; there is no dry fallback.
- The audition/export WAV is never touched by the analysis source choice.
- Track without clips or a deleted track fails with a clear error instead of a fabricated report.

Roadmap-Delta D3: per-track rendered analysis next to the full-mix report. No new measurements, no Stage-D-beyond-scope claims.
