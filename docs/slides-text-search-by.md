# BY: literal Slides run search

Slides outline now includes a local literal text search with case option, per-run nonoverlapping occurrence counts and direct navigation to the matching exact source-bound canonical run. This is separate from the existing slide-title/filter control. No summary, model, network, notes/images/layout reads, edits, file writes or export.

Query trimmed and bounded to 256 characters; scan bounded to 10000 runs/2000000 UTF-16 units and 65536 units per run, result list to 200 matching runs. Limit notice means incomplete scan, never claims exhaustiveness. Case-insensitive search uses JavaScript lowercase, not language-aware equivalence or normalization. Excerpt is first 160 units of run; navigation selects the whole run, not an occurrence span. No cross-run matching or regex interpretation. Results remain literal/inert.

Before navigation, current deck source/busy/run part/text are rechecked, rejecting missing/duplicate/stale runs. Production uses the existing slides.selectText command, which rechecks source/text again after slide navigation before selecting. Source-keyed component resets query on deck changes. Real production worker/navigation integration remains CI/manual, not verified by the injected fixture.

Validation: 12 search/panel tests and 1 browser light/dark test passed. Exact second-slide/run payload, case count, stale rejection and script-like inert excerpt tested. 390px light/dark pixels inspected: controls/counts/results readable and bounded. DS/Layers/Commands/UI-Commands pass; inherited Layers missing-transpiler/87 ignored/4 stale. tsc only inherited missing generated slides WASM module. No deps/budgets changed, $0; synthetic data only, native/Rust/WASM/full desktop E2E CI-only.

Roadmap-Delta: Slides outline filter -> literal per-run text discovery/counts/navigation. Office summary work unchanged; Sheets inference gated on live-read integration; local semantic Search remains paused pending integration/CI.
