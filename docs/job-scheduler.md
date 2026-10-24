# Application job scheduler

`phase1/src/lib/jobs/scheduler.ts` ports the independent TypeScript scheduler
from `perf/lazy-hosts-jobs`. It has no UI or Rust dependency. The lifecycle
driver installs its lease bridge automatically; no shell callback is needed.

## Ownership and admission

Use `jobScheduler.run(spec, async lease => ...)` for finite work. It acquires
a lease and releases it on success, failure or acknowledged cancellation.
For long-lived transports use `acquire(spec)` and release the returned lease
in a `finally` block when the transport actually stops. View unmounting is
not a cancellation signal.

| Priority | Lane | Default concurrency | Purpose |
| --- | --- | --- | --- |
| 0 | realtime | 2 | Saves, recovery commits, playback |
| 1 | interactive | 2 | Activation, foreground operations |
| 2 | background | 2, low profile 1 | Export, AI work |
| 3 | background, shared with P2 | Shared | Optional maintenance |

Within lanes the scheduler uses priority then FIFO. After 30 seconds waiting,
P3 ranks with P2 at the next admission pass. It never outranks P0 or P1.
Interaction (`setInteracting(true)`) and pressure pause P3. Critical pressure
also pauses new P2 work. Active jobs are never preempted.

All lanes share one byte envelope. P0/P1 have separate concurrency slots,
not a memory bypass: they can wait behind a byte reservation or an exclusive
engine. Defaults are 256 MiB, at most 64 queued jobs and 32 terminal history
records. The live profile selects 128/256/512 MiB (low/normal/high) and its
heavy-job concurrency. A profile shrink retains running work and leaves
oversized queued jobs waiting for expansion or explicit cancellation. New
jobs larger than the current envelope reject before queueing.

`estimatedBytes` must describe retained resources, including captured input
and planned allocations. Copy input buffers only after admission. Zero is
allowed for work with no reservation estimate, but supplies no memory
protection. This is cooperative scheduling, not an OS memory limit or
preemption of synchronous WASM. The queue bounds records, not caller-owned
closures or source buffers.

`resources` declares dependencies. `exclusive` adds dependencies that serialize
with the same exclusive keys across every lane. A read-only `resources` key
does not acquire an exclusive lock. Declare shared engine operations with
matching `exclusive` keys if they cannot overlap.

## Cancellation and observation

Cancellation of queued work rejects its acquisition and removes its resource
needs. For running work it aborts `lease.signal` and sets
`cancellationRequested`, but retains the slot, bytes and resource ownership
until release. Operations must observe the signal and stop safely. A lease
released after a cancellation request records `cancelled`, not `completed`.
`cancellable: false` refuses stop requests and external aborts after submission;
an already-aborted submission still rejects. Use it only for integrity work
that must finish.

`list()` returns a stable immutable snapshot until a scheduler event.
`subscribe()` observes queue, admission, progress, cancellation and terminal
changes. Progress is clamped to 0..1. Observers cannot release capacity by
throwing. History is bounded and does not pin resources. Records can contain
caller-supplied document ids, so do not send them as telemetry without review.

## Lifecycle bridge

`lifecycle/integration.ts` registers `wireJobLeases` before activation. Exact
resource keys match directly; `studio:photos` also matches outstanding
`photos.engine` or `photos:session:...` dependencies. Prefix matching respects
delimiters (`video2.engine` does not pin `video`). Both queued and running jobs
count. Cancellation requests retain protection until release.

The manager checks leases before checkpoint capture, again after asynchronous
checkpoint storage just before releasing resources, and before eviction. Lease
users must not start new operations against resources already being released
by an asynchronous adapter: acquisition does not itself resume a suspended
studio or lock an adapter's entire asynchronous teardown.

Every five seconds the driver merges native/heap memory pressure with tracked
studio bytes plus running job reservations. The manager's existing hysteresis
remains authoritative. Profile budgets apply on store updates and pressure
samples, without an intermediate normal-pressure admission window. Sampling
does not overlap; disposal ignores late results, unregisters leases, clears
the timer and restores default scheduler admission. Jobs survive that cleanup.

## Scope and verification

This change installs the scheduling foundation, not studio call-site migration.
Existing exports, AI turns and playback do not automatically acquire leases.
No Jobs UI, engine lazy loading or native scheduler is included. An interaction
producer must call `setInteracting` when integrating gesture-aware maintenance.

Targeted job/lifecycle tests cover priorities, FIFO aging, budgets and profile
changes, exclusive engines, queued/running cancellation, immutable snapshots,
resource mapping, real suspension/eviction checks, checkpoint races, probe
cleanup and pressure forwarding. `test:core` includes the jobs test directory.
Desktop memory behavior and full-app exports still need CI and native testing.
