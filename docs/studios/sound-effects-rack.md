# Sound effects rack (B1)

Status: implementation slice, awaiting integrated Rust/WASM and desktop checks. No new dependency. Stage C remains out of scope.

## Workflow

Arrange & Mix now includes an effects rack for each track and the stereo master. Add up to eight built-in inserts, change metadata-defined parameters, enable/bypass slots, move them up/down, duplicate or remove them. Full-rack bypass allows comparison after rendering. Local user presets store a versioned rack, pinned DSP revision and actual parameter values, with a twelve-preset bound. Presets contain no audio and no remote upload. The first B1 implementation has no preset deletion UI; reusing a name replaces that local preset.

The list comes from real opened-source Sound session plugin metadata. Without an opened source there is no invented processor catalogue. Unknown processor IDs and invalid parameter names/ranges are rejected by the WASM bridge, not silently dropped. Generic parameter controls use the engine's English metadata names; surrounding UI is localized in five languages.

## Document and pipeline

Session schema v2 adds `masterRack` and a `rack` on each track. Version-1 arrangements migrate to neutral empty racks without changing sources, timing, gains or clips. A rack has a schema version, pinned DSP revision, bypass flag and ordered slots with stable IDs. Rack changes use the session's atomic history and invalidate preview/export. Old active single-clip effect settings are separate and are not automatically imported into an arrangement; the clip editor's processing order is unchanged.

One mix pipeline applies clip timeline edits/gains/fades, then track inserts, track level/stereo balance, summing and master inserts. All DSP runs in the mix worker. `process_rack_pcm` in the existing Rust/WASM engine accepts float planar stereo and returns float PCM, so chaining never quantizes through 16-bit WAV. The output length is unchanged: tails stop at the session boundary. B1 does not append a reverb tail or claim real-time monitoring. This boundary is displayed in the rack UI. The same final float WAV is auditioned and exported.

Rack rendering must never fall back to a dry mix after an error. When an active rack requires a missing or stale built WASM module, the render fails with a rebuild error. Existing neutral Stage-A sessions can render without loading DSP. An internal dry mixer rejects sessions with active inserts so an accidental caller cannot silently omit them.

## Validation and remaining checks

Tests cover neutral v1 migration, v2 round-trip, strict rack and preset parsing, chain limits, duplicate IDs, unknown revision, atomic history and order-sensitive PCM math. Processor test doubles establish rack order and bypass, not upstream processor quality. A Rust identity fixture checks a neutral float rack without quantization; it is authored for CI and was not executed locally because Rust/WASM tools are absent here.

The browser harness has real worker PCM mixing, rack UI insertion/bypass, local preset save, session reopen/relink and WAV download. Its decoder is a fixture stub and rack is deliberately bypassed. These are not evidence that active Rust DSP ran. Build Sound WASM and run processor fixtures plus real compressed import/playback on the integrated branch before claiming production audio validation. Screenshots cover light/dark/narrow layout and actual rack controls.

Roadmap-Delta B1: ordered track/master built-in insert racks, bypass/reorder/duplicate/delete, local rack presets, v2 persistence/migration and a float-PCM pinned-DSP bridge. Spectrum/LUFS and target mastering are later B slices, not implied by B1. No plugin hosting, codecs, recording or new dependencies.

## Preset management (sound studio upgrade)

Rack presets can now be deleted: every preset chip in the rack has a delete button (`sound.rack.deletePreset`, 5 languages). Storage logic lives in `lib/sound/rackPresets.ts` (load, save, delete, injectable storage). Saving a new name when the twelve-preset bound is reached is rejected with a message instead of silently dropping the oldest preset; saving an existing name still replaces it in place. One invalid stored entry is skipped without hiding the other presets. Duplicating an insert now places the copy directly after the original with a collision-safe id. No new dependency, store or command. Tests: `rackPresets.test.ts`.
