# A3 scheduler and integration contract

Base: `04bc442`. This package implements a standalone Rust planner/run manager,
minute-resolution cron UI and strict Desktop command adapter. It does **not**
open a second runtime or automatically enable a daemon. Native dispatch is an
integration gate, not completed by the UI fixture.

## Files and persistence

- `phase1/vibespace-sched`: Rust-only croner + chrono-tz + bundled SQLite.
- Storage migration 5, `src/migrations/scheduling.sql`: only `sched_schedules`,
  `sched_jobs`, `sched_events`; existing runtime runs/events remain unchanged.
  A6 may also allocate version 5: integrator must renumber the two new migrations
  contiguously. Keep both SQL scripts, raise SCHEMA_VERSION to the final version.
- All persisted time values are UTC epoch milliseconds. Zone is a validated IANA
  name. Five-field minute cron only; no sub-minute schedule overload.
- The wall-clock matcher uses croner with a synthetic UTC wall time, then resolves
  through chrono-tz. Spring gaps skip; fall folds use the first instant only.
  Tests cover 2026 Berlin and New York transitions including calls during fold 2.
- `sched_events` is durable and append-only. Sequence cursor (not chat/timestamps)
  drives `return_card`. Resolved consent is not shown as still pending within a
  page. Results are bounded to 1000 events per page; continue from `lastSeq`.

## Integrator: required wiring before calling scheduling complete

1. Acquire the A1 owner lock using the existing Runtime open route. Implement
   `OwnershipPort::ensure_owner` against that live lock. Do **not** return Ok
   unconditionally or open another Runtime. Ownership must stay valid throughout
   effects. Scheduler writes, heartbeats and finish all recheck this port.
2. Construct `Manager::open(<runtime-data>/vibespace.sqlite, owner, Config::default())`
   only after Runtime/Store migration/recovery. A separate SQLite connection is
   intentional; it does not perform the existing Store's AllActive recovery.
3. Install it once through `VibeScheduleState::install`. The managed state is
   otherwise unbound, and Create/List/Return-card/Enable fail closed with
   `schedule_owner_unbound`. Preview can run without opening any data file.
4. Implement `RunPort` through the existing runtime's start/status/stop API.
   `Dispatch.request_id` is the durable job UUID: forward unchanged to runtime
   start so crash/retry deduplicates. Start creates a fresh isolated working copy
   through Runtime; never call the engine directly. A retry reattaches the same
   runtime request rather than creating another live run.
5. Drive `tick(instance_id, current_utc_ms, runtime_port)` while Somnia is open,
   at the heartbeat cadence (`lease TTL / 3`, default 10 seconds). Do not enable
   tray/autostart/CLI daemon. Do not hold the schedule-state mutex from RunPort
   callbacks or synchronously re-enter it. `RunPort::start` is nonblocking.
6. Dispatch consent level is an intent, never an effect approval. Scheduled
   desktop control and skill scripts stay stripped unless separately opted in
   through their own gates. No schedule setting grants these permissions.
7. Auto-apply is false when omitted. Opt-in additionally requires autonomous
   in-scope consent. Apply only via native broker/checkpoints, using
   `with_auto_apply` while a current ownership/lease/fence and broker token are
   valid. A persisted auto_applied flag prevents repeated apply through the same
   job/fence. The bool is supplied by trusted Rust broker integration, never IPC or
   model output. This callback may not await/re-enter scheduler or outlive the
   lease. There is no auto-apply action in the Desktop IPC surface.
8. Integrator should reconcile runtime terminal state before startup retry;
   runtime AllActive marks orphaned work crashed. `tick` reports errors, lease
   expiry, retries and timeout visibly; never silently switch to fixtures.
9. Render the `vibespace_schedule_return_card` DTO in the shared return UX and
   persist its `lastSeq` only after the user marks the page seen. `needsYou`,
   `failed`, `done`, `misfires` carry schedule/job IDs and native runtime IDs
   for Review/Open-log routing. Do not generate recap text from chat.

## Safety and bounds

Default concurrency 2, enforced atomically across SQLite connections. Lease
30 seconds, heartbeat 10 seconds, per-attempt timeout one hour, max attempts 3.
Expiry increments the fence before requeue and emits crashed + retry/failed.
Retries use capped exponential backoff. Planning scans at most 24 hours;
lookback truncation and omitted/coalesced runs are events shown in return cards.
Skip ignores genuine misfires but permits live ticks within the 60-second grace.
Catch-up cap is 1..100, default Coalesce. No pending runs are dispatched from a
disabled schedule; active runs require explicit Stop rather than silent kill.

The scheduler does not claim OS sandboxing. The runtime/policy owns that boundary.

## UI and commands

Five Commands are registered in build.rs, editor capability, invoke_handler and
command manifest: preview, create, list, set_enabled, return_card. Main window +
main webview + trusted local origin only; no extension windows. The command
manifest generator now recognizes existing `sync_command!` DTO declarations;
otherwise it failed on `vibespace_create_space` in the unmodified base.

Schedule button mounted in VibeSpaceHome for native draft and selected studios,
so A5's StudioDetail file stays disjoint. Dialog has Rust preview, next three
instants, all misfire choices, cap, consent level and off-by-default auto-apply
warning. A preview is bound to every form field; changes invalidate Save.
27 translated keys live in `locales/vibespace/schedules/`, five locales; a separate
merge avoids collision with A10's `locales/vibespace/{locale}.json` files.

## Verification in this package

- Rust 1.95 installed locally. `cargo test` sched: 15 acceptance tests pass.
- `cargo test` storage: 42 tests pass (existing schema/recovery/FTS plus new schema).
- `cargo test --manifest-path phase1/src-tauri/Cargo.toml --no-default-features --lib`:
  209 pass. Desktop-feature check stops at missing system glib-2.0; new native
  command compilation on a GTK/WebKit-capable host is still required.
- `npx tsx --test src/lib/vibespace/schedule.test.ts src/lib/tauriPermissions.test.ts`:
  six tests pass, including five-locale parity and exact generated command args.
- `npx tsc -p src/lib/vibespace/schedule.tsconfig.json --noEmit`: passes. Existing
  broader QA config needs jsdom not present in package dependencies.
- `node scripts/errors/gen-commands.mjs --check`: passes after regeneration.
- `npx playwright test -c playwright.schedule.config.ts`: one browser fixture
  test passes. Isolated Vite config avoids unrelated missing craft WASM builds.
  Screenshots in test-results/ were opened and visually checked for readability,
  default-off warning, opt-in/cap, preview, app-open notice. They are fixtures,
  **not** evidence of native runtime scheduling or live-model execution.
- Windows/Linux real-native scheduling smoke, full runtime fence composition,
  real scheduled review/apply and native return-card composition remain gates.

## Dependencies/licences

croner 3.0.1 MIT (`LICENSE.md` read); chrono 0.4.45 and chrono-tz 0.10.4 dual
MIT/Apache-2.0 (their local distributed LICENSE files read). No copied external
source. rusqlite 0.32 bundled, serde/json, uuid and thiserror follow existing
project versions. Pinned exact resolved versions in the scheduler Cargo.lock;
Desktop Cargo.lock adds these path/dependency entries. No provider/network calls
in tests; package download during toolchain/build setup is not app behaviour.
