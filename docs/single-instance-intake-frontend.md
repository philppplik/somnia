# Single-Instance Intake: Frontend Client, Orchestrator and Policy (12.0.1, D2-E)

Package `phase1/src/lib/intake/`: the renderer half of native open-request
intake. The host (Rust, D2-C) parses cold argv and second-instance callbacks,
queues requests and issues one-shot read grants. This package drains the queue
and drives every request through the normal Smart Open pipeline (#166, S9).

## Files

| File | Contents |
|---|---|
| `intakeTypes.ts` | Notice/context/retry types owned by D2-E; re-exports the shared wire DTOs from `src/lib/commandContracts.ts` (S2). |
| `openRequestClient.ts` | Typed client for the 8 intake commands over S2 `invokeCmd`, plus the `somnia://open-requests` count event. |
| `intakeOrchestrator.ts` | Serial drain/claim/read/open/ack loop with gate, logging ownership, release-on-abort and retry. |
| `intakePolicy.ts` | UNC policy pref (default deny), persisted like workflowPrefs, synced to the host. |

## Request lifecycle

1. **Listener before first drain.** `onOpenRequestsChanged` is installed before
   the first `drain_open_requests`, so an enqueue in between is never lost
   (mutex-race fallback: the host also emits the count event on cold enqueue).
   Events arriving mid-processing queue exactly one more drain pass.
2. **Gate before every claim.** `whenIntakeAllowed()` (D3 intakeGate) is
   awaited before each claim. Queued requests have no timeout, so a paused
   crash review never loses or expires a request. The claim timeout applies
   host-side to *claimed* requests only.
3. **Claim, then UI-only context.** Right after `claim_open_request`, the
   orchestrator populates the D3 correlation map via `registerIntakeContext`
   (corr -> ordinal -> basename) before any item work. Basenames live only in
   that map and in the coordinator input; never in logs, acks or notices.
4. **Same-file rule.** Items claimed as `activated-existing` focus their open
   project via `focusExisting` and are acked without a read.
5. **Read by one-shot grant.** `read_by_grant` failures arrive as
   `CommandError` with the incident already logged once at the cmd() boundary;
   the orchestrator reuses `incident_id` and does not log again.
6. **Open through #166.** Granted items become `OpenInput`s
   (`key`/`identityToken` = host identity token, `requestId`+`ordinal`
   attached) and go through the S9 coordinator with `intent:'open'`.
   Approval, revision revalidation, single-document-studio deferral and the
   dirty-document guard all live there. Approval-level SOM-UI-006 is logged by
   the S9 `approvalFailed` sink, not here.
7. **Ack by ordinal.** Outcomes map back by ORDINAL, never by basename
   (collisions are real). Partial success is acked truthfully. A renderer
   business failure with no incident yet is logged ONCE at this boundary:
   SOM-APP-002 per failed item (`corr`, `ordinal`, `ext`, `cause`), or
   SOM-FS-006 when the cause is `lock-conflict` (APP-002 is then not emitted).
   Cancel produces no event, no log, no replay.
8. **Exactly one final notice.** `presentIntakeOutcome` is called once per
   request with the complete report (all outcomes and counts, `resetCount`
   included for the APP-012 "Opening was restarted after reload" rule). The
   D3 presenter applies the quiet rule for pure-success reports.
9. **Release on every abort edge.** A throw anywhere between claim and ack, an
   orchestrator stop or a reload sends `release_candidate` (idempotent
   host-side). After a successful ack no release is sent, so host retry tokens
   stay valid.

## Retry

`registerRetryExecutor` (D3 retryActions) receives the executor
`run(requestId, ordinal, token)`: `retry_open_item` mints a fresh grant and
re-stats, then the item goes through the NORMAL #166 pipeline alone. No batch
re-prompt for unrelated items; the dirty-document approval still applies to
the retried item itself. The executor maps onto the D3 status union
(`opened/rejected/failed/cancelled/expired`); user cancel reports `cancelled`
with no error log, and a new failure is a new occurrence (logged once).

Automatic retry: at most one per run, only for lock-class causes
(`locked`/`lock-conflict`), and only when the ack token carries a
host-supplied `expiresAt` (epoch milliseconds, host TTL 60s, S2-0003) that is
still in the future. The renderer never computes TTL from receipt time; a
token without expiry yields no retry action (D3 rule).

## Cause hygiene

Only slug-shaped class tokens (`/^[a-z][a-z0-9-]{0,40}$/`, e.g. host failure
classes from `CommandError.code`) are acked or logged as `cause`. Coordinator
`reason` strings are human text that may embed basenames and are never
forwarded into acks, logs or notices; unclassifiable renderer failures use
`internal`.

## Policy

`intakePolicy.ts` persists `{allowUnc}` under `somnia.intakePolicy.v1`
(sanitized read, default deny). `setIntakePolicy` pushes to the host FIRST
and persists only after acceptance; a native failure rejects and leaves the
old setting. `syncIntakePolicyToNative` runs once after boot, before the
first drain. The Settings "File access" checkbox is an integrator hunk.

## Integration wiring (bootstrap, single integrator)

```ts
const client = createTauriOpenRequestClient();      // null on web: no intake
if (client) {
  await syncIntakePolicyToNative(client);           // before first drain
  const stop = await startIntakeOrchestrator({
    client,
    whenIntakeAllowed,                              // D3 intakeGate
    openFiles: coordinator.openFiles,               // S9
    presentIntakeOutcome,                           // D3 presenter
    focusExisting,                                  // app: focus project by id
    registerIntakeContext,                          // D3 noticePresenter
    registerRetryExecutor: registerIntakeRetryExecutor, // D3 retryActions
    logEvent,                                       // D1 log.ts
  });
}
```

## Tests

`src/lib/intake/*.test.ts` (node:test via tsx, included in `test:core`):
client contract (camelCase args, corr on rejections, typed CommandError,
legacy -> SOM-APP-099, base64 reads, contract-violation guard, retry-token
pass-through, count-only event) and orchestrator behavior (listener before
drain, gate blocks claim without losing the request, serial processing,
activated-existing focus, context before item work, ordinal mapping under
colliding basenames, incident reuse vs single APP-002/FS-006, cancel silence,
release on every abort edge incl. mid-flight stop, one notice with complete
counts, one auto-retry for locked, executor status union, event-driven
re-drain). Policy: sanitize/deny-default, native-first ordering, failure
keeps old value, web fallback, boot sync.
