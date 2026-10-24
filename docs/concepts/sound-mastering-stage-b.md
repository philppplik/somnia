# Sound Studio B: Effects Rack, Spectrum and Loudness

Status: proposal, not implementation approval. Stage A is a bounded offline stereo arrangement. No dependency or native permission change is proposed here.

## Outcome

Turn a rough voiceover/music mix into a controlled, inspectable output without leaving Sound. The visible change is an ordered effects rack beside a spectrum and a loudness report, with saved processing recipes and an audible before/after review. This is offline production, not a low-latency DAW or a promise of broadcast certification.

## B1: ordered effects rack

Replace the one-effect recipe with a versioned ordered chain. Start with per-track inserts and a stereo master chain; defer per-clip chains, sends, busses and third-party plugin hosting. Slots have stable identities, explicit parameter values, enable/bypass, duplicate, delete and reorder controls. Include a local user preset library, full-rack bypass and original/processed audition. New sessions start neutral. Migrate the old single effect into one slot without changing its order relative to trim, pitch, fades or normalization.

Use only processors actually exposed by the pinned SoundCraft DSP registry. EQ, compressor/limiter, de-esser, gate, reverb and delay are candidates, not a promise that every one passes quality tests. Parameter controls use the existing metadata ranges. Save the DSP revision, recipe schema version and concrete settings in the session. Unknown or removed processors block the affected output with a useful error rather than being silently dropped. Tail handling is explicit and bounded; the export review shows the resulting duration.

The rack needs one authoritative worker pipeline: source edits -> per-track chain -> track level/pan -> sum -> master chain -> analysis -> float WAV. Define this order before implementation. Any pre-existing fades or clip gains remain source/timeline edits. The engine, preview and exported file must agree on order, tail and duration. Reorder, bypass and preset changes each create an atomic undoable action. No effects run on the UI thread.

## B2: spectrum and measured output

Add a spectrum panel for a selected rendered track or final mix, with labelled frequency/amplitude axes and an explicit analysis source. A frozen analysis is labelled with its render revision. Do not animate invented frequency bars or imply a live FFT while playback is stopped. Reuse the pinned DSP spectrum implementation if it passes deterministic tone, silence and stereo fixtures; expose its FFT/window/channel-combination settings in the technical documentation.

Add output measurements: sample peak, true peak, gated integrated LUFS, short-term and momentary loudness where supported. Peak and RMS already exist in the clip workflow, so those alone are not the feature. The pinned upstream DSP includes a loudness meter and oversampled true-peak implementation; its presence in code is not proof of standards accuracy. Validate against independent reference vectors before using compliance language. Silence or too-short audio shows an unavailable/insufficient-duration state, never a plausible fabricated LUFS number. Linear amplitude peak is not true peak and peak normalization is not loudness normalization.

Analysis is tied to the exact rendered revision and requested output range. Source, mute/solo, level, routing, rack or range changes invalidate it immediately. The visible summary shows the measured audio scope, duration and render state. Do not analyse one buffer and export another.

## B3: reviewed loudness-target export

Offer an explicit custom target in LUFS and a true-peak ceiling, with optional presets whose labels describe their own settings rather than promising universal platform requirements. First show current measurements and the required gain. A loudness gain can exceed the peak ceiling, so never treat gain alone as a guaranteed solution.

If limiting is selected, show that it changes dynamics, process offline, then measure the final result again. If the chosen processor cannot meet both targets, report the actual result and let the user revise the target. Do not silently clip, auto-enable a limiter or label a target as achieved from arithmetic. The review compares before/after loudness and peaks, allows audition, and exports the same accepted WAV. Keep Stage A's safe native output grant and stale-revision checks.

## Scope and proof

Recommended order: B1 rack/schema migration and presets; B2 spectrum plus verified loudness analysis; B3 target pass and post-render output review. Each is separately reviewable and can be held behind a development gate until its real audio tests pass. No coming-soon buttons.

Acceptance includes order-sensitive rack fixtures, bypass neutrality, parameter validation, tails and overflow limits, save/reopen migration, atomic undo, exact preview/export parity, missing media, render cancellation and stale-analysis guards. Meter tests need silence, known-amplitude tones, stereo summing, intersample peaks, gating and short duration; include independent BS.1770/EBU-style reference vectors before describing the meter as conformant. Inspect light/dark/narrow views and real desktop playback. Keep the existing bounded session budget until measured render/memory evidence justifies a change.

Licensing and integration: prefer existing pinned DSP code, with notices preserved. Adding upstream mix/model/host crates is a new dependency decision, not implied approval. No CLAP/VST/AU loading, GPL bundle, optional codec, cloud model or paid service in B. Any new package requires Philipp's separate nod and a license/transitive review.

Roadmap-Delta: proposed multiple serial effects with presets, real spectrum and measured loudness/true peak, then a reviewed target-mastering pass. Not implemented by this document. Recording, transcript editing, MP3/AAC and long-form streaming remain outside B.

## Inspected sources

Baseline Somnia: `int/beta5` at `87791e06b5e37b7d169ba79ea1ffe9685d1b1f75`, plus local Stage-A patches. Upstream DSP: the already pinned `c51e5d5ec52f11c6264b72e26661fa712feb5345`.

- https://github.com/philppplik/somnia/blob/int/beta5/phase1/src/lib/sound/protocol.ts
- https://github.com/philppplik/somnia/blob/int/beta5/phase1/src/lib/sound/session.ts
- https://github.com/storytold/soundcraft
- https://github.com/storytold/soundcraft/blob/c51e5d5ec52f11c6264b72e26661fa712feb5345/crates/dsp/src/offline.rs

The pinned DSP `meter.rs`, `spectrum.rs` and registry were also inspected in the upstream checkout. These are code findings, not independent quality or performance results.
