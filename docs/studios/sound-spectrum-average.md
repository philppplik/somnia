# Sound whole-render spectrum (C2)

Status: implementation slice, headless-tested. No new dependency. Stage D, recording, codecs and live analysis remain out of scope.

## What changed

The output spectrum is no longer the first 4096 samples only. `spectrumPowerAverage` slides 4096-point Hann windows at 50% overlap across the entire rendered PCM (the final window is explicitly zero-padded), averages the linear stereo power per bin and converts to dB. The panel footer states the actual window count; the spectrum is still a frozen analysis of the exact rendered revision, never a live animation. One-window input (short renders) is numerically identical to the previous first-window behavior. Zero-padding the final window slightly lowers the reported average for constant material; this is documented behavior, not hidden smoothing.

The B2 measurement rules are unchanged: analysis binds to the rendered revision, edits invalidate it, silence floors at -140 dB, and loudness/true-peak stay labelled unverified.

## Honest limits

- A time average, not a spectrogram: where in the render energy occurs is not shown. Short transient detail is diluted across windows by design.
- The Rust loudness/true-peak bridge and its reference-vector validation remain CI/native work, exactly as in B2.
- Cost grows linearly with render length (~3000 window pairs at the 130 s bound) and runs in the mix worker, never on the UI thread.

Roadmap-Delta C2: whole-render averaged stereo-power spectrum with an explicit window count, replacing the first-window-only spectrum. No new measurement claims, no Stage-D scope.
