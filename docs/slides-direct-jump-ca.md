# CA: direct slide-number jump

Slides overview shows current/total position and a direct slide-number field. Enter or Go navigates through existing slides.showSlide, without scrolling/filtering deck thumbnails. Human 1-based input is converted only after strict whole-number validation: no rounding, clamping, decimal/exponent or zero-leading input. Bounds checked against current deck count and source/busy state before dispatch; production adapter checks source/actual slide again after navigation and surfaces failed/drift status. Current-slide target disabled; pending navigation locks field/action.

No model/summary, source data export, edits, save or new dependencies. Source-keyed component resets on deck changes and reflects navigation from other controls. Existing previous/next and filter untouched. This is read-only navigation, not an edit lease.

Validation: 12 direct-jump/panel tests and 1 light/dark browser fixture test passed. Bounds, exact 75->74 conversion, Enter, current position and stale-source refusal tested. 390px light/dark pixels inspected: current/total, field and button readable. DS/Layers/Commands/UI-Commands pass; inherited Layers missing-transpiler/87 ignored/4 stale. tsc only inherited missing generated slides WASM module. Real worker/production navigation remains CI/manual; native/Rust/WASM/full desktop E2E CI-only. Synthetic fixture only, $0, no deps/budgets changed.

Roadmap-Delta: Slides overview -> direct validated slide-number navigation. Office summary unchanged, Sheets inference still unwired pending live-read integration, semantic Search paused awaiting integration/CI.
