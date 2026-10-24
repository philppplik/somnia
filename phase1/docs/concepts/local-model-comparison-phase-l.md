# Local model comparison phase L

## Roadmap-Delta

AI > Local offers an explicit 2-4 exact-installed-model comparison and custom prompt (4000 characters), plus small German/English coding and writing prompts. Same prompt, sequential fresh requests, no tool or file/document context, no cloud route or automatic fallback. Fresh exact digest and daemon version before and after each model. Existing per-inference show/locality guard remains, cloud transport fails closed. No automatic starts on refresh/open/history.

Results show side-by-side literal text, completion/partial/failure/cancel states, elapsed wall time including validation, provider output tokens, and generation tokens/s ONLY when provider supplies both count and positive eval_duration nanoseconds. Never calculates tokens/s from characters or wall time. Missing timing stays unknown. Partial/cancelled rows never display a completed throughput. Requested context 8192/output limit 512/keep_alive 0 shown; daemon may clamp. Three-minute per-model cancellation budget. Cancel aborts owned connection and skips queued models, not a claim of daemon-global unloading.

Not a benchmark: sequential warm-cache/load/model-default differences, no measured quality/ranking, seed/temperature unpinned, no quality winner. Closing/unmount cancels owned work. Output is untrusted plain text, never HTML or executable tools.

Explicit local save, up to ten comparisons with 2MB total serialized ceiling. No silent eviction. LocalStorage quota/corruption errors surface; no success assumed. Prompt/output/exact model/digest/version/timing persist only after Save. Opening saved history does not rerun inference. Delete removes saved entry; current visible result stays until replaced/closed. No telemetry, dependencies, paid provider or model download. These prompts may be sensitive; visible local-only storage notice.

## Evidence and boundaries

Ollama chat response fields, including eval_count and eval_duration: https://docs.ollama.com/api/chat . Counters remain provider-reported, not app estimates. Metadata/digests are daemon evidence, not cryptographic attestation against a hostile local proxy.

Browser fixture uses synthetic providers. Real installed daemon inference, hardware memory pressure, provider timings, long generation cancellation and native app E2E remain device/CI gates; no cargo/WASM. Comparisons run in the existing browser local transport, not new native engine routes. General settings activity gate is used to avoid overlapping Agent jobs, not a global daemon resource scheduler.

Validation: 379 Agent/provider tests passed; three browser tests passed, repeated after rebase with focused model/provider tests. Fresh base origin/int/beta5 6ea4bf05 (K integrated). DS and command manifest green. Layer checker reports no new violations but warns about unsupported TS transpiler version. Full tsc remains inherited three/Studio3D/generated slides assets errors; no L-path errors. Browser tests verify explicit start, no script execution, local history reload/delete, cancel skips queued models, DE presets, desktop/narrow layout. No actual model inference/download or native E2E executed.
