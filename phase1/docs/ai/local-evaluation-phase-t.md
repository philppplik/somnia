# Local assistant task evaluation

One small German editable prompt for each explicit task key: chat, vibe, code, summarize. User picks one exact installed local model, optionally a second distinct model, edits the prompt and explicitly clicks Run. No auto-run on open/refresh/task selection/history. Runs sequentially through existing fresh digest/daemon-version checks, per-request local-weight verification, cancellation and 180-second bound. No tools, documents, code execution or cloud fallback. Output remains literal untrusted text.

Results show model tag/digest, text and measured elapsed time. Latency covers preflight/inference/reconciliation, not pure generation speed. Existing reported output tokens/rate stay unknown if provider doesn't report them. This is not a benchmark, a task-quality score, or proof that model output is correct. User judges the editable task and result. One row for single model; two rows use existing responsive side-by-side comparison layout.

Explicit Save uses existing bounded device-local comparison JSON store (10 entries/2 MB), no silent eviction. Task is preserved in a fixed prompt header and model tag/digest/time in each row. Saved results open without rerunning, can be deleted and export/import through existing comparison JSON. Imported-unverified marker remains. Single-row portable data is valid only with the evaluation task marker; normal comparison still requires 2-4 models. No separate second history or unbounded result cache.

Roadmap-Delta: four editable local task prompts, explicit one/two-model evaluation, result/latency, local saved history and side-by-side display. Reuses existing bounded sequential runner, no duplicate transport, no automatic scoring, no inferred task selection, no cloud. Five locales, no dependencies or spend.

Native/local actual inference and full app E2E remain CI-only. Browser fixture uses synthetic local model responses, not evaluation evidence. No local model downloaded or run during development.
