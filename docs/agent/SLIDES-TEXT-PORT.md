# Slides text-run port: preparation only

Base d4432f985. Opt-in typed inspect/propose for one canonical editable PPTX text run. Pin exact DocumentRef plus attachment generation, native revision, slide index, package slide part and run index, matching `slides/editCopy.ts` and `summarySelection.ts`. No guessed shape/paragraph locator, first-run fallback, deck conversion, raw package bytes or arbitrary ZIP paths. Host must supply fresh permission-gated snapshot, exact current target and review stage only. Mandatory inspect/propose checks; no-op permissions belong only to synthetic fixture. Text is untrusted data, bounded at16KiB UTF-8.

No production registration or execute callback. No Apply button. Cancellation, stale async targets, unsupported/noncanonical runs, no-op and invalid inputs fail before stage. Proposals state review-only/executeAvailable=false; saved=false.

Observed owner: `slides/session.ts` has bounded before-deck byte history, revision and generation. `editSlideText` copies exact run old text, then asynchronously opens/renders new working bytes before pushing undo. Failures can occur between native open, working commit/render and history push. Existing `applyDeckSession` guards reviewed text/revision/identity but returns only revision, not logical applied/history receipt. Bounded history-length difference cannot prove applied1. This prep slice cannot claim execution or native undo proof.

Next: owner-controlled transactional acceptance with exact reviewed old/new run and generation/revision guard, native content readback and one logical undo receipt after commit; isolate observer failures, protect against manual ABA/reopened sessions, reconcile uncertain post-mutation states without auto-retry. Prove package structure/formatting retention, real render and native history in CI before registering execution. No full-deck generic overwrite.

Tests: typed read/propose, host permission denial, UTF8/no-op/controls/cancel, noncanonical refusal and asynchronous run/part/generation/native revision/document identity/revision changes. Synthetic Light/Dark preview only; no model, WASM, real render, save or format-preservation proof.
