# Available-RAM fit hints, Phase AC

Existing inspectHardware/local_models_hardware provides the same safe one-shot
system snapshot already used in LocalModelAdvice. Reuse it; no new probes, process
commands, dependencies, polling or user RAM collection. Browser/unavailable reports
stay Unknown. Model weights are daemon-reported sizes or existing catalog estimates,
not measured runtime allocations. No source/quality claims were added to the catalog.

Pure ramFit uses available RAM, never total RAM or added GPU memory. Estimated need
is weights * 1.25 + 1 GiB. Below that is too big for this RAM heuristic, within an
additional 25% margin is tight, and beyond it likely fits. Every badge is explicitly
RAM estimate; GPU/offload may behave differently. Invalid/missing/future/stale input
is Unknown. Snapshot expires after two minutes; one local timeout rerenders labels
without refreshing hardware/network. Existing GPU-aware advice remains separate.

Sizes plus new RAM badges appear together in installed-model advice and catalog.
Chat/summarize start with the small existing catalog candidate; code prefers the
coder only with likely-fit RAM, otherwise smaller candidates; Vibe offers only the
existing tools candidate with likely-fit RAM. Unknown/too-big/tight never produces
a first-candidate suggestion. These are untested starting points, no automatic
selection/download, tools authorization or claim of task performance. Vibe still
needs current local/capability checks. All new UI strings support five locales.

Evidence: 16 focused Node tests, 437 broad Agent/provider tests and three browser
fixtures pass. Bounds, reserve/margin, zero, invalid, stale/future, no GPU/total RAM
addition, task fallback/no suggestion covered. Actual component with injected existing
hardware path: one probe, unknown state, all five locales and German desktop/narrow
layout inspected. Native hardware probing itself was not executed. Unfiltered tsc
still has only missing generated slides-engine/pkg/somnia_slides.js. DS, commands,
UI inventory and layers pass with existing compiler/ignored/stale baseline warnings
(1653 modules/5935 dependencies). No cargo/WASM/native/full app E2E evidence.

Roadmap-Delta: real-device memory-pressure/fit acceptance and task-quality evidence
remain open. Context/KV cache, concurrent apps and daemon policies may exceed reserve;
never treat hints as admission control or turn a recommendation into selection.
