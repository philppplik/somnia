# Local studio/chat stream robustness, Phase AK

Five deterministic tests cover cancel after a visible partial, owned reader cleanup,
fresh retry without partial history replay, timeout, quiet caller abort, no fallback
after partial and fail-closed context/output budget. No UI owner changes.

One gap: timedProvider only classified timeout inside catch; a provider honoring
abort by quietly ending yielded successful termination. Check timedOut and caller
abort after the source loop too. Failure now cannot masquerade as a completed run.
Sources that ignore abort remain outside this guarantee; no forced process kill.

Existing Ollama/session/chat handling preserves partial display with incomplete
status, excludes it from completed/replayable history and makes retry fresh. Routing
never retries/falls back after an emitted event. Context byte guard refuses overflow
rather than silently truncating source data; caller messages remain unchanged. Existing
context/output-tokens taxonomy provides the notice. A daemon's own silent context
clamping cannot be detected from metadata and no detection is claimed. No new UI text.

Evidence: 39 focused tests and 459 broad Agent/provider tests pass. DS, command/UI
inventory and layers pass at 1661/5961 with existing compiler/baseline warnings.
Unfiltered typecheck only inherited missing generated slides-engine/pkg/somnia_slides.js.
No native Vibe/Rust, real daemon, package/full-app or WASM execution. Previously
submitted native partial gate fix needs actual CI result; this JS slice is not proof.

Roadmap-Delta: native/real-daemon cancellation and timeout proof, context-clamping
telemetry if daemon exposes trustworthy evidence, and packaged incomplete/retry UI
acceptance remain open. Never claim silent truncation detection or daemon-wide cancel.
