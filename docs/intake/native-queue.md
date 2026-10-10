# Native intake queue (S6)

## Integration and ownership

The queue, grant store and policy are in-process only. Add `intake: OpenQueue` to
`Backend` and use its existing mutex. There is no second global mutex and no
renderer-provided path argument. S5 owns `intake/mod.rs` and `parse.rs`; register
`commands`, `grant`, `identity`, `policy`, `queue` there and expose `pub mod intake`
in lib.rs. S2 owns the typed command boundary and event sink. S4/the integrator
owns the eight Tauri wrappers, invoke_handler/capabilities and desktop.rs.

Commands in commands.rs accept the trusted window label, queue and host clock.
All eight check `main` before reading or mutating state. Tauri wrappers must pass
`window.label()` from the actual WebviewWindow, not a renderer argument. Obtain
host time from the native system clock. Wrap the core call in `commands::execute`
(or `execute_with` with a test sink) inside the canonical `cmd_ctx` boundary.
The execute adapter drains queued events once, returns the event's incident_id
in AppCommandError, and relies on S2's fixed wrapper to avoid a second log. Ack
never emits business errors. Invalid-ack transport errors can be logged once by
the command boundary. Never log IntakeError with Debug or attach raw arguments.

`take_events()` is destructive. Do not both manually flush it and use execute.
Callback enqueue can use execute with `Ok(queue.enqueue(...))`. Emit
`somnia://open-requests` with count only after enqueue or stale reset. Never call
queue enqueue or parser network metadata directly in a Windows message callback;
dispatch approved-path inspection and enqueue to a blocking worker.

Policy rejection events carry expected=true and require a visible operation
outcome, not a defect notice. The enqueue report includes rejected count and an
optional request ID. Rejected-only requests have no file grants/queued request;
the callback integration must deliver a sanitized rejection outcome separately
so those requests are not silent. APP-012 is recovery-only in the presenter,
using reset_count=1 and affected count; no second defect card.

## Backend project overlap

Refresh `ProjectAccess` from current Backend.projects while holding the mutex
immediately before Claim AND Retry. SingleFile entries contain the canonical
file plus the current native identity. Folder entries contain canonical root
and the actual visible-file set from Project::list_files(), joined to root and
canonicalized. Neither structure is serializable. Call
`refresh_project_access(&access)` before claim/retry. Merely sharing an ancestor
is not sufficient visibility. Visible nested files activate the folder project
with no grant or new Project. Identity-equal single files activate their project.

After folder picker canonicalization, call `check_folder_open` before
Project::open. Open single-file projects below that root cause SOM-FS-006 with
count only. The integrator supplies correlation and surfaces the returned
notice. Cross-process and nested-folder locking belong to S7's service layer.
Do not replace these checks with disk locks: that would lose ActivatedExisting.

Claim creates no Projects or OS locks. release_candidate revokes grants and
cancels unacknowledged work, idempotently. Committed Projects remain live. The
orchestrator owns disposal of uncommitted prepared candidates; the desktop
adapter must drop any additional candidate Project it creates. Backend count
and real lock-release verification are required at that integration boundary.

## Bounds and states

* Up to eight retained requests and 64 items per coalesced request.
* One claim at a time. Drain is repeatable and read-only apart from stale-reset
  maintenance in the command core.
* Coalesce only into a Queued request within 300 ms. Identity dedupe only applies
  to queued items within 2 s. The values still require Windows calibration.
* Overflow evicts the oldest Queued request, never Claimed. If all slots are
  retained by claim/retry state, reject the new request and emit one APP-008.
* A stale claim resets once after 300 s; a second stale claim terminates. Queued
  work has no claim timeout. Cancellation does not requeue or issue retries.
* Terminal request data is pruned when retry capabilities expire; capability
  storage has at most one grant per request item. No token goes to diagnostics.

## Grants and retry

Grant TTL is 120 s. Every attempted read consumes an issued grant before expiry
checks or I/O. Version checks compare native identity, size and nanosecond mtime
before open, on the opened handle, after read and against the final pathname.
Reads are bounded by the service media ceiling (25 MB); text/model limits still
apply downstream. Removed/replaced/changed files fail with APP-002. Bytes use
base64 in the native response. Public DTOs include a basename for transient UI
only; canonical paths and version hashes never serialize.

Ack returns `{accepted,retryTokens:[{ordinal,token,expiresAtMs}]}`. Client converts
host UTC epoch milliseconds once to expiresAt. Only Locked/Io failures receive
a retry capability. TTL 60 s, single-use, bound request+ordinal+version hash.
Retry removes its token before validating parameters, expiration or re-stat.
It returns a fresh grant for exactly that item. Unrelated outcomes cannot be
acknowledged in a retry claim. Finally-release after successful ack preserves
those capabilities; pre-ack cancel revokes them. Retry does not authorize an
open or bypass the renderer's normal dirty approval/revalidation pipeline.

## Verification

Real temporary files and production parser/core/sink are used, with no skips.
Fault tests assert exactly one persisted event for overflow, unknown claim,
one-shot reuse, TOCTOU delete and partial ack's decision-boundary failure.
Lock tests assert only SOM-FS-006. Other tests cover expiry, rollback-clock,
identity/size/mtime mutation, replacement, sparse oversized files, duplicate
ordinals, partial cancellation, coalesce cap, reset-once, eight untrusted-window
commands, UI-only basename privacy and nested folder visibility.

Linux verification uses Rust 1.95 and cargo test --no-default-features. Native
Tauri/Windows NSIS/MSI callback/focus/network tests are integration work, not
claimed by these core tests. Baseline/S2 unrelated compiler warnings are not
changed in this package. The wire DTO requires S2 EventSpec.ordinal and the
incident-id no-relog fix. No Cargo changes or desktop edits are in the S6 patch.
