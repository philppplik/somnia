# Problems panel

The panel is global to the shell. It combines the existing `projectProblems()` syntax producer (also used by the CodeMirror gutter) with a session-only runtime store. Closing the panel or changing studios does not lose runtime failures.

## Producers

- Legacy `log()` / `reportError()` warnings and errors, including UI error boundaries and global unhandled errors.
- Registry `logEvent()` failures delivered by `subscribeReportedFailures()`, with the ring entry's cause, context, registry ID and incident reference.
- Unexpected `invokeCmd()` AppCommandError rejections through an optional reporter, preserving native code, detail, correlation and incident ID. Expected cancellations stay quiet.
- `executeCommand()` failures which previously only changed the status notice.
- Photos, Sound, Video, Documents, Slides and Vector error-state writes; Sheets' open/operation handlers; Design import and inline Photos/Sound/Vector operations.
- Explicit Open invalid/unsupported/failed outcomes, including a malformed MP3 that never reaches the decoder. File extension is only a diagnostic destination hint for rejected input, not a claim about its actual content or a routing change.
- Fetch rejections and non-success HTTP responses, even when a caller catches them. AbortError is an expected cancellation. The wrapper returns the original response and rethrows the original rejection.

## Local details and navigation

Runtime entries keep the logger's existing secret redaction and bounds. Available technical text, error name, stack, native detail and context can be expanded and selected/copied. This is not a new upload or export path: diagnostics ZIP/report allowlists are unchanged. Extremely long messages/stacks may be truncated by the existing logger; worker-origin stack traces only contain what the worker returned.

Rows are grouped by studio, then errors and warnings. Source rows navigate to the open project file/line or media tab. If a source was never opened or has been closed, clicking returns to its studio without reopening it or pretending a source line exists. File-less application errors have no source navigation.

The runtime history is bounded at 500 rows. Repeated local failures are counted. Discarded older rows are disclosed. Clear runtime history removes only the local historical runtime rows, not syntax/gutter diagnostics and not the underlying error. New repeated failures remain visible even if file logging suppresses repeats.

## Verification

- `npx tsc --noEmit` and `npm run build`.
- `npx tsx --test src/lib/problemsStore.test.ts src/lib/log*.test.ts src/lib/invokeCmd.test.ts`.
- All unique files from `test:core`, batched with `--test-force-exit --test-concurrency=4 --test-timeout=25000` to avoid existing open handles and an unbounded concurrent run.
- `npx playwright test tests/problems-runtime.spec.ts tests/diagnostics-gutter.spec.ts --workers=2` with the real WASM package artifacts. Tests isolate unrelated external catalog/update requests while explicitly exercising real HTTP/network errors.
- Light-theme expanded runtime details and dark-theme gutter/panel consistency screenshots.

No new Rust commands, permissions or dependencies are required.
