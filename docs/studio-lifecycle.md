# Studio lifecycle

How Somnia manages studio resources: lifecycle states, checkpoint-based
suspension, resource budgets, pressure handling and local telemetry.
Binding concept: [performance-resource-architecture](concepts/performance-resource-architecture.md).
This page covers the shipped core (branch `perf/lifecycle-core`): coordinator,
scheduler, budgets, telemetry, settings and the Slides pilot adapter.

## States

| State | Meaning |
| --- | --- |
| active | Visible studio. Input, render and foreground commands allowed. |
| warm | Recently used studio. Session and resources retained for fast return; no continuous work. |
| suspended | Verified checkpoint kept; view-owned workers, timers, decoders and caches released. |
| evicted | No runtime data. The durable source or recovery checkpoint remains. |

A studio the user never opened is cold: it holds no slot anywhere.

## Transition policy

Implemented by `StudioLifecycleManager` (`phase1/src/lib/lifecycle/manager.ts`):

- One active view, at most one warm studio (none in the low-memory profile).
- Warm grace: 30 seconds, then suspension. Churned studios (three resumes
  inside 60 seconds) get a longer grace so rebuild cycles settle.
- The warm cap suspends older warm studios immediately; the grace applies
  only to the most recent one.
- Pressure (tracked bytes at 80% of the envelope) bypasses the grace and
  suspends warm studios. Exit below 65% held for ten seconds. At 95%,
  optional admission is blocked (`admissionAllowed()`).
- Suspension runs the race-safe sequence from the concept: generation bump,
  pin check, verified checkpoint, revision recheck, resource release.
  Reactivation during the sequence invalidates it.
- Resume re-registers sessions synchronously, so the host mount path never
  rebuilds a dirty session from stale source bytes.

Suspension blockers, checked before every checkpoint:

- Adapter pin reasons (IME composition, pointer transactions, recording,
  playback, presentation, non-cancellable writes). Pinned studios stay warm
  and are re-checked after 30 seconds.
- Active job leases. Lease providers register with
  `manager.registerJobLeaseProvider(hasLease)`. The job scheduler
  (`src/lib/jobs/scheduler.ts`, branch `perf/lazy-hosts-jobs`) wires
  `hasLease(resourceId)` and `needsResource(resourceId)` (queued work counts)
  here. Resource id conventions: `studio:<id>` plus studio-owned ids such as
  `slides:session:<name>`; the scheduler's own ids (`video.engine`,
  `video.export`, `photos.engine`, `agent.turn`, `sound.playback:<name>`) are
  checked through the same providers.
- A failed or refused checkpoint pins the studio warm, reports a problem and
  never drops data.

Eviction is refused while a studio holds the sole recoverable copy of
unsaved edits (`hasUnsavedChanges()`).

## Registry contract

`StudioDef` gains one optional field; manifests compile unchanged without it:

```ts
lifecycle?: () => StudioLifecycleAdapter;
```

The adapter hooks (`phase1/src/lib/lifecycle/types.ts`) are all optional:
`estimateBytes`, `resourceIds`, `pinReasons`, `hasUnsavedChanges`,
`snapshot`, `suspend`, `resume`, `dispose`. Snapshots are versioned and
checksummed (`lifecycle/checksum.ts`) and never contain secrets, Blob URLs
or worker handles. Studios without hooks stay fully resident.

## Pilot: Slides

The Slides studio (`lib/studios/slides.ts`) registers the first adapter,
built in `lib/slides/session.ts` with pure snapshot helpers in
`lib/slides/lifecycleSnapshot.ts`:

- Authoritative recovery: current edited package bytes plus undo/redo
  history, per open deck.
- Suspension releases the WASM worker, rendered slide, thumbnails and the
  present cache; dirty decks suspend safely because the checkpoint holds the
  edited bytes and history (checksum-verified before release).
- Resume recreates the session entry synchronously, reopens the engine from
  the checkpointed bytes and re-renders the current slide.
- Presentation mode and in-flight operations pin the studio.

Checkpoints live in the `CheckpointStore` (64 MiB memory budget, the
concept's suspended bucket). When memory cannot fit a checkpoint, the least
recently used entries spill to the durable backend (`spill.ts` seam,
`idbSpill.ts` IndexedDB implementation: local, private, 7-day retention
pruning, structured-clone payloads only). A checkpoint larger than the whole
budget goes straight to the spill; refusal is the last resort, so unsaved
state is never discarded. Resume hydrates spilled checkpoints before
restore. Settings > Advanced > Performance has a Clear-checkpoints control.

## Budgets and profiles

`lifecycle/budgets.ts` carries the concept's bucket table. Normal profile:
1536 MiB envelope (buckets 1280 MiB plus 256 MiB estimation margin), one
warm slot, two heavy jobs. Low-memory profile: 768 MiB, no warm slot, one
heavy job. High profile: candidate expansion, one warm slot. Automatic
profile selection uses `navigator.deviceMemory` as a hint and falls back to
normal; these are soft tracked-resource allowances, not OS RSS caps.

## Settings

Settings > Advanced > Performance:

- "Suspend inactive studios to free memory" (default on). Turning it off
  restores every suspended studio from its checkpoint, then keeps all
  studios resident.
- Resource profile: Automatic / Low memory / Standard / High memory.

Stored in localStorage key `somnia.lifecycle.v1`, read live on every
transition, so changes apply without restart.

## Telemetry

`LifecycleTelemetry` is a bounded local ring buffer (500 events) with
monotonic marks and transition, pin, churn, pressure and admission events.
It records studio ids, counters and durations only: no paths, document
names, prompts or payload content. `exportDiagnostics()` produces an
explicit JSON export showing exactly what would be shared. Remote reporting
is not wired and would need a separate opt-in.

## Wiring

`main.tsx` installs the driver (`lifecycle/integration.ts`): it subscribes
to the store's `activeStudio`, resolves adapters from manifests and reports
problems through the app log. Pressure-level changes are published through
the wiring's `onPressure(level)` callback, matching the job scheduler's
`setPressure('normal' | 'pressure' | 'critical')` contract.
`getStudioLifecycle()` exposes the installed manager for the lease-provider
registration.

## Extension lifecycle

Extension runtimes (`lib/extensions/runtime.ts`) support protocol v2
suspend/resume (concept section 8):

- Extensions register optional `somnia.lifecycle.onSuspend` /
  `somnia.lifecycle.onResume` handlers in the worker. `onSuspend` returns
  serializable state; the host holds it and terminates the worker.
- Suspension is refused while a command runs or the worker speaks an older
  protocol: legacy extensions stay resident (pinned). A hung suspend kills
  the worker with a diagnosis, like any other timeout.
- Resume recreates the sandboxed worker from the same manifest code with the
  same CSP and checked API - no new authority - re-activates it, then hands
  the state back through `onResume`.
- Running a command auto-resumes a suspended extension (activation by
  command). Under memory pressure the shell suspends all idle extension
  runtimes (`suspendIdleExtensions`, wired to the lifecycle pressure signal).

## Honest limits

- Verified with `tsx --test` unit tests (43) and `tsc --noEmit`. The Slides
  adapter logic is typechecked; its end-to-end suspend/resume cycle needs an
  E2E run in the web harness or the desktop build, not done here.
- `Worker.terminate()` and WASM linear-memory release are best-effort:
  freeing engine objects does not promise immediate RSS reduction.
- Native memory/pressure probing and the per-studio adapters beyond Slides
  are later phases of the concept. The IndexedDB spill path is typechecked
  and covered with a fake backend; it has not run in a real browser here.
