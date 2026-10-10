# Project leases (12.0.1)

The default build uses `recovery_base/locks/`. Every canonical directory has a
`dir-<sha256(lowercase canonical directory)[0..16]>.lock` scope lease. A folder
holds shared leases on its proper ancestors and an exclusive lease on its root.
A single-file project holds shared leases on its parent and all ancestors,
plus an exclusive `file-<parent hash>-<identity token>.lock`. A folder also
retains an exclusive `folder-<root hash>.lock` primary lease.

All acquisitions use non-blocking fs2 calls, in root-to-leaf order. No held lease
is upgraded. A failed open drops all partially acquired handles. Handles live
with the Project; close/drop or process termination releases them. Empty stale
files are harmless and must not be deleted: another opener might hold their inode.
There is no global gate, index, stale pruning, or persisted canonical path.

Two different files in the same folder can be edited independently. Folder/file
and nested folder/folder overlap is rejected, including across processes. Nested
folder projects were previously possible; rejecting them is an intentional safety
change. Independent sibling folder projects remain possible.

`folder-lock-interim` is opt-in, not a default feature. It retains the old
`<recovery root hash>/session.lock` and one-session-per-folder behavior. File
identity is still available for intake activation. Recovery directory names and
journal names do not change in either build. Single-file recovery lists exclude
other documents before counting the document limit; direct sibling restore stays
denied by the existing single-file path restriction.

Only genuine OS lock contention becomes `AppError::Locked`; other failures stay
I/O errors. The command/intake boundary owns the single `SOM-FS-006` event
(project-locked, warn, conflict) and its notice. The service does not log a second
event. Intake activation into an existing folder project and folder-open conflict
notices are integration responsibilities, not separate service side effects.

## Automated verification

Run both configurations after integrating the intake identity module and Cargo
feature declaration:

```sh
cd phase1/src-tauri
cargo test --no-default-features --locked
cargo test --no-default-features --features folder-lock-interim --locked
```

The service tests use real directories, actual Project reads/stages/saves,
OS-backed fs2 handles, concurrent threads, and a separate test process. They cover
same-file contention, canonical aliases, file isolation, release after candidate
disposal, recovery compatibility, simultaneous opens, nested overlaps in both
open orders, crash release, sibling folder independence, and partial-open cleanup.
Recovery tests exercise both 64 sibling records and the actual 2048-record limit.
No mocked lease result, skipped test, or fixme substitutes for these checks.

Headless Rust tests do not replace installed Windows NSIS/MSI tests. Before
release, verify activation into an existing folder creates no second project or
error event, folder-open conflicts show a notice, candidate cancellation reduces
the actual backend project count, and contention yields exactly one FS-006 event.
Also run the complete desktop/default-feature test and build gates on an environment
with Tauri's system development libraries.
