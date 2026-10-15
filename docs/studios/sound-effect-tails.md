# Sound effect tails (C1)

Status: implementation slice, headless-tested. No new dependency. Recording, codecs, streaming and live analysis remain out of scope.

## What changed

Sessions carry an explicit, bounded effect tail (0-10 s, whole frames at 48 kHz) on the arrangement document (schema v3). Rendering extends the mix past the last clip with silence and runs the same track/master rack order over the extended buffers, so reverb and delay can ring out instead of being cut at the session boundary. The audition player and the exported float WAV share the exact extended render, and the exported duration grows by the tail; that is displayed behavior, not a hidden padding.

Without active inserts the tail is pure silence. Neutral sessions do not load DSP. The dry internal mixer still ends at the session boundary and still rejects sessions with active inserts. A rack that returns a different length than it was given is rejected ("rendered length (session plus tail)"), and an empty session with a tail still fails.

## Document and migration

Version 3 adds `tailFrames` (integer frames, 0 to 480000). Version 1 and 2 documents migrate with a neutral zero tail; clips, timing, gains and racks are untouched. Validation stays strict: out-of-range, fractional and unknown fields are rejected. The tail is an undoable session edit (`sound.arrange.session.tail`, clamped 0-10 s), invalidates audition/export like every other edit, and round-trips through JSON save/reopen.

## Honest limits

- Whether a processor actually emits tail energy depends on the pinned upstream DSP; feeding trailing silence is the mechanism, not a guarantee that every plugin rings. Built-WASM behavior with real reverb/delay processors remains a CI/native validation item, as with B1.
- The tail applies to full-session renders and the mastering pass (which rerenders the same session). No per-clip or per-range tails.
- Tails stop at the bounded length; there is no automatic tail detection or fade-out of the tail end.

Roadmap-Delta C1: explicit bounded effect tails on session output through the existing pinned rack bridge. No Stage-D scope, plugin hosting, codecs or new dependencies.
