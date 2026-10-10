# D3 diagnostics UI integration

S10 adds shell-owned modules. It does not edit App, main, StatusBar, Settings,
commands, the root catalogue or the logger. Apply after S1 and S2.

## Startup and ownership

1. Create a native client with `createNativeDiagnosticsClient()` or a web client
   with `createWebDiagnosticsClient(D1SafePreviewCollector)`.
2. Create the diagnostics store with a **safe export event** getter, not raw
   `recentLog()` entries. Supply an explicit clipboard writer.
3. Create a crash review store. Call `review.start()` synchronously **before**
   starting the intake orchestrator. Do not defer this call to a React effect.
   It acquires the initial-review pause synchronously. Web mode skips listing.
4. D2 awaits `whenIntakeAllowed()` before every Claim. No claim, grant or ack
   occurs while queued behind this gate. This does not replace dirty approval.
5. Create/install a diagnostics host with the coordinator's independent
   `whenDestructiveApprovalIdle()` hook. Do not use the intake promise as that
   hook. Manual diagnostics pauses future claims, waits for the initial decision
   and any active destructive approval, then opens one surface.
6. Mount `DiagnosticsHost` outside studio boundaries. Root fatal handling calls
   `review.dispose()` and `host.close()` and keeps a working preview route.
   Unmount cleanup releases pauses. Startup list and mark-reviewed calls time out
   after two seconds. A late result does not reopen review in the same boot.
7. Place `NoticeHost` in a dedicated shell status slot, never the studio save slot.
   Supply its `whenDestructiveApprovalIdle` prop from the same coordinator.
   Connect `subscribeReportedFailures` using `connectFailureNotices`.
8. Merge `DIAGNOSTIC_LOCALES` into the existing five catalogues before CI checks
   the generated active message manifest. Components already subscribe to locale
   changes; no frozen translated string lives in a store.
9. Help/Settings/fatal entry points call `openDiagnostics`. The D3 compatibility
   `copyErrorReport` opens a preview; it does not copy. Migrate old call sites
   rather than importing D3 into the logger and creating a cycle.

## Intake presentation and retry

D2 calls `registerIntakeContext(requestId, items)` and emits one final operation
outcome. corr+ordinal is identity, never the displayed basename. Context is
bounded UI memory and removed on acknowledgment/eviction. It must never enter
reports, logs, fingerprints, clipboard or persistent stores.

Queue reset APP-012 is operation-only with positive reset and affected counts.
Expected/pure cancel outcomes never become defect notices. The presenter never
logs: cmd transport errors retain their original incident ID.

Retry is absent unless D2 registers a safe executor and attaches a host-issued
capability with expiry. Tokens are private module memory, consumed before await,
and never included in public notice snapshots. The host enforces identity,
mtime, TTL, single-use and current dirty approval. User cancellation is silent.

## Diagnostics and incidents

Shared DTOs live in `lib/commandContracts.ts`, not duplicate UI declarations.
S2 SaveOutcome uses **kind**, not status. Native write receives only snapshotId;
there is no renderer path or grant argument. Copy uses exact immutable reportText.
Option changes invalidate old snapshots. Copy denial leaves selectable preview;
Save cancel returns ready without an error/success incident. Native transport
errors are not logged again. Native packaging, filtering, quotas and actual file
bytes remain D1 responsibilities.

Viewing/opening/exporting never marks reviewed. Continue submits displayed IDs;
failed marking leaves pending badges but releases intake. Delete needs the
integrator's async confirmation (Cancel default), serialized without nested
Base UI dialogs. Close the diagnostics surface before opening that confirmation
and restore it if cancelled; do not pass window.confirm.

Recovery draft-present is **currently available local recovery drafts**, not a
checkpoint for the selected incident. Only producer-supplied incident-scoped
proof names session, scope and checkpoint time. No restore button is offered by
this package; a separate executable persistence capability is required.

## Verification

Run:

```
cd phase1
npx tsx --test src/lib/diagnostics/diagnostics.test.ts src/components/diagnostics/diagnostics.test.tsx
npx tsc --noEmit
```

Tests cover gate release paths, nested pauses, race ordering, exact copy bytes,
refresh/defaults/expiry/cancel, typed command arguments, retry double-click/expiry,
manifest/placeholder parity, and honest recovery labels. These are focused tests,
not claims of shipping-app E2E. The integrator owns actual-app E2E using the
existing extension-store/install standard with no skip/fixme or fixture host.

Local component screenshots were inspected in all five locales with app tokens,
light/dark/forced-colors, 960x600 and narrow/zoom-equivalent viewports. The short
viewport scrolls the complete popup instead of collapsing incident content.
Shipping-app screenshots, native dialogs/ZIP bytes and Windows behavior still
need integrated verification. The base checkout lacks the generated Slides WASM
module, which independently prevents a repository-wide clean tsc run.
