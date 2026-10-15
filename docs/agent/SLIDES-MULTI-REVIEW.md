# Reviewed text changes on one slide

The local sidepanel can inspect up to 20 existing text runs on the current slide
and preview exact before/after text. The user must accept the whole preview.
The host merges it into one reviewed deck text and calls
`applyDeckReviewedSlide` once. This is one receipt and one native undo entry.
The single-run path still uses `applyDeckReviewed`.

The private review pins document, current slide, native generation/revision,
source identity and exact old text. Acceptance checks permission and native state
again. Success requires an owned receipt, one history step and exact owner
readback. Undo is one-use and only works while that receipt remains the newest
unchanged deck edit. Later changes refuse undo rather than overwrite them.
No automatic apply, disk save, cloud fallback or cross-slide batch is enabled.

The panel limits remain 20 runs, 4096 UTF-8 bytes per run and 16384 total; the
owner's broader 50-run limit does not increase model context. Layout, notes,
dimensions and run structure are read-only. Full Rust/WASM/desktop roundtrip
coverage remains CI-only. Local tests cover actual OOXML edited-copy validation,
private transactions and synthetic panel review, not native worker execution.
