# Local AI failure-mode review, Phase AA

Deterministic tests use injected HTTP/stream/process ports and deferred barriers,
not a real Ollama daemon or native desktop. All nine scenario tests pass. A broader
425-test Agent/provider suite passes. No existing test assertion was weakened.

| Scenario | Test coverage | Result / change |
| --- | --- | --- |
| Daemon dies mid-stream | One partial frame, barrier, socket error; exact one request, no history/proposals, network notice | Existing fail-closed handling passes; no stream retry |
| Model removed during run | /show verifies exact model, subsequent /chat returns 404 | Existing model-not-found behavior passes; no substitution or retry |
| Pull disk full | Error frame after start | Existing fixed error classification, no Complete, owner cleanup passes |
| Pull network drop | next rejects | Existing failure/release passes; no implicit retry |
| Pull malformed progress / EOF | Invalid count or EOF without success | Existing failed/interrupted state, no false completion passes |
| Pull cancel | Barrier before terminal success; cancel then late success | Existing Interrupted/Unknown preserved, never Complete; overlap refused |
| Malformed chat replies | Non-object/array message, numeric tool name, invalid count, object error | GAP: could falsely complete or emit invalid values. Fix validates before any event escapes |
| Malformed local metadata | Array model_info | GAP: nonempty array could prove local weights. Reject arrays; remains unverified |
| Offline switch mid-run | Active cloud and verified local requests; switch before deferred completions | Existing privacy gate aborts/refuses cloud late output/new requests, keeps local request alive; disabling does not fabricate consent |
| Two session turns | Deferred provider, second prompt before first completion | Existing single-flight session passes with one completed history |
| Two panel runs before session | Task inventory awaits microtask; second synchronous run, then third after first failure | GAP: session-only guard allowed pre-session replacement. Reserve controller for async preparation; second refused, release on every terminal outcome so third allowed |

The panel guard uses the existing controller, not a new global lock. Active aborted
work keeps the existing session-running guard until its completion. Clear still
revokes the owner and cancels work. Finalizers only release their own controller,
never a successor's. Provider counts must be nonnegative safe integers. Optional
invalid generation-duration metadata retains its existing absent/unknown behavior;
no existing duration test was changed. Tool identity/message validation is checked
before buffered events are yielded. Array model metadata cannot establish locality.

Validation: nine matrix tests and 425 Agent/provider tests pass. Final unfiltered
typecheck still reports only missing generated slides-engine/pkg/somnia_slides.js.
DS, command manifest and UI inventory pass. Layers passes at 1652 modules/5933
dependencies, with existing compiler/ignored/stale-baseline warnings. No native,
packaged, full-app E2E, real daemon fault injection or WASM/cargo execution.

Roadmap-Delta: run native and real-daemon death/removal/disk/network fault scenarios;
prove shared daemon cancel outcome rather than claiming socket cancel stopped it;
check OS-level and cross-process concurrency after packaged acceptance. No deps,
new polling, flags, permissions, UI text or spending.
