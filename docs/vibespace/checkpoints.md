# Vibe Space checkpoints, isolated copies, review and apply

Crate: `phase1/vibespace-checkpoints` (`somnia-vibespace-checkpoints`). Standalone Rust library with its own `Cargo.toml`, `Cargo.lock` and empty `[workspace]`. It is not wired into the app yet. Runtime dependencies: `sha2`, `serde`, `serde_json`. No dev dependencies.

It implements the "isolated copy -> checkpoint -> review -> explicit apply" part of `docs/concepts/vibespace.md` (sections 3.2, 3.3, decision A7): content-addressed, format-agnostic snapshots, and no agent write that reaches the real project without an explicit, reviewed apply.

## Model

| Term | Meaning |
|---|---|
| Vault | A directory owned by Somnia core: object store, isolated copies, journals. Must not overlap any scope root. |
| Scope | One or more named roots (`name` + directory), excludes, quotas, symlink policy. |
| Snapshot key | `"<root name>/<relative path>"`, UTF-8, `/` separated. The only path form used in manifests, reviews and selections. |
| Checkpoint | Manifest (key -> SHA-256, size, exec bit) plus the scope and free-form run metadata. Its id is the SHA-256 of its record. |
| Isolated copy | A full copy of a checkpoint under `<vault>/isolated/<id>/<root name>/`. The only place an agent writes. |
| Review | Change list between baseline and isolated copy, with unified text diffs or binary metadata. |
| Apply | Writes selected reviewed changes to the originals after a backup checkpoint and a conflict check. |

## Public API (`Vault`)

```rust
let vault = Vault::open("<app data>/vibespace/<space>/checkpoints")?;
let scope = Scope::single("proj", "/home/me/project");          // or Scope::new(vec![ScopeRoot{..}, ..])

let cp   = vault.checkpoint(&scope, RunMetadata { run_id: Some("run-1".into()), ..Default::default() })?;
let copy = vault.isolated_copy(&cp)?;                           // give the agent copy.root_dir("proj") only
// ... agent edits files in copy.root_dir("proj") ...
let review = vault.review_changes(&cp, &copy)?;                 // or vault.diff(&cp, &copy) for metadata only
let report = vault.explicit_apply(&ApplyRequest {
    expected_baseline: cp, copy: &copy, review: &review,
    selection: Selection::Paths(vec!["proj/src/main.rs".into()]),   // or Selection::All
    options: ApplyOptions::default(),
})?;
vault.restore(&report.preapply_checkpoint, &RestoreOptions::default())?;   // undo
vault.discard(&copy)?;                                          // drop the copy, originals untouched
vault.recover()?;                                               // after a crash, see below
```

Also: `load_checkpoint`, `open_isolated`, `verify_store`, `ObjectStore` (`put_bytes`, `put_reader`, `get_bytes`, `copy_to`, `verify`, `verify_all`), `unified_diff`, and `path::normalize_key`.

Guarantees per call:

- `checkpoint`: captures every regular file byte for byte. The same content, scope and metadata give the same id and write no new objects. Metadata is part of the id; the crate records no timestamps, the caller's database should.
- `isolated_copy`: full copy, no `.git`, no reference back to the originals. Fails cleanly (partial copy removed) if any object is missing or corrupt.
- `diff` / `review_changes`: scan the copy with the same rules as a checkpoint (symlink, special file, quota and case checks apply to what the agent produced). Text diff only when both sides are UTF-8, contain no NUL and are at most 1 MiB; otherwise `ContentDiff::Binary` (sizes and digests). Exec-bit-only changes are `ModeChanged`.
- `explicit_apply`: see the next section.
- `discard`: removes only `<vault>/isolated/<id>` (validated id, never the caller's path) and its record. It cannot reach the original project.
- `restore`: makes the scope match a checkpoint. Takes a checkpoint of the current state first. Files absent from the checkpoint are kept unless `remove_extra` is set. Restore never deletes directories.

## Apply sequence

1. Take the vault lock (advisory `File::try_lock`, released by the OS if the process dies). Refuse if an interrupted apply/restore is pending (`PendingRecovery`).
2. Check `expected_baseline` equals the copy's and the review's baseline. Check every selected path appears in the review.
3. Copy each selected result file into the object store, hashing while reading. If its digest or exec bit differs from what was reviewed, fail with `StaleReview`. Nothing in the originals has been touched yet.
4. Take a pre-apply checkpoint of the originals using the baseline's scope (roots must still resolve to the same canonical directories). This is the backup and the undo point (`ApplyReport::preapply_checkpoint`).
5. Compare the pre-apply manifest with the baseline for each selected path. Any difference is a conflict (modified, deleted or already existing). All conflicts are returned together as `Error::Conflicts`, and nothing is written, including the non-conflicting selected files. A selected change whose result is already present is reported as `already_applied` and skipped.
6. Check the resulting tree for case collisions, which also covers a case-only rename where only the "add" half was selected.
7. Plan the operations (deletions first, then writes, sorted by key), refuse symlinked or non-directory parents, write the journal (atomic write plus fsync), then run each operation:
   - re-check parents, create missing directories (recorded in the journal);
   - re-verify the target still equals what the plan expects (hash);
   - write a stage file next to the target (`.somnia-stage-<apply id>-<n>`), fsync, keep the replaced file's permission bits;
   - existing file: `rename` over it. New file: `hard_link` to the target, so a file that appeared meanwhile is never overwritten (falls back to check plus rename on filesystems without hard links);
   - deletion: `remove_file` (the content is in the pre-apply checkpoint).
8. Mark the journal committed, write a record under `applies/`, remove the journal.

Hunk-level selection is not implemented; selection is per file.

### Failure and crash behavior

Individual file replacement is atomic (rename or hard link). A multi-file apply is NOT atomic. What is guaranteed instead:

- An error during step 7 rolls back every operation by inspecting the actual file state. A path is reverted only if it still matches what this apply wrote. If the user changed it in the meantime it is left alone and listed in `RollbackReport::preserved`. Directories created by the apply are removed if empty. The error is `Error::ApplyFailed { cause, rollback }`.
- If rollback itself fails, the journal stays and later mutating calls fail with `PendingRecovery` until `recover()` succeeds.
- If the process dies, the journal remains. `recover()` (explicit, never automatic) finishes a committed journal or rolls back an uncommitted one with the same rules. Until then the originals may be partially applied.

### Remaining race

Between the final hash check and the `rename` over an existing file there is a window of a few microseconds in which a concurrent user write would be replaced. New files are protected by the hard link. There is no portable no-clobber replace for existing files. The window is documented rather than hidden; the pre-apply checkpoint still holds the previous content.

## Path and filesystem rules

Rejected with an error (never silently fixed or skipped), at checkpoint, diff and apply time:

- non-UTF-8 names; empty, `.` and `..` components; absolute paths; control characters; components over 255 bytes; keys over 1024 bytes; nesting deeper than 128;
- by default (`portable_names = true`): `\ < > : " | ? *`, trailing dot or space, Windows device names (`CON`, `NUL`, `COM1`, ... with or without extension);
- symlinks and Windows reparse points (`SymlinkPolicy::Reject`, default). `SymlinkPolicy::Skip` skips and reports them; they are never followed, copied or replaced. A selected path whose target is a symlink is a conflict;
- sockets, FIFOs and devices;
- two paths that fold to the same lowercase string (case-insensitive collision), and a name used both as file and directory;
- overlapping roots (compared after canonicalization), duplicate root names, roots overlapping the vault, quota overflow (`max_files`, `max_total_bytes`, `max_file_bytes`; defaults 100k files, 4 GiB total, 1 GiB per file; also enforced on the isolated copy at diff time).

`.git` (file or directory, any depth, any case) is never captured and never exists in an isolated copy. Anything in the copy that is skipped is listed in `ChangeSet::skipped` and never applied. Manifests loaded from the store are re-validated, so a damaged or hostile store cannot cause writes outside the scope roots.

Captured: file bytes and the Unix executable bit. Not captured: empty directories, mtime, owner, ACLs, xattrs, hard-link identity (hard links become independent files), sparse layout. The agent can create new empty directories in the copy but those are not applied.

## Object store

`<vault>/objects/<aa>/<62 hex>`. Written to `tmp/`, fsynced, made read-only, renamed into place, directory fsynced. Every read re-hashes the content: `CorruptObject` on mismatch, `MissingObject` if gone. A deduplicated put re-verifies the existing object; a corrupt one is an error, not silently replaced. `verify_store` checks everything. There is no garbage collection yet, so the store only grows. Do not point scope roots at it and do not give the agent access to `objects/`, `journals/` or other isolated copies.

## Git strategy (documented, not implemented)

Phase 1 uses full isolated copies for every project, including git repositories, because git worktrees share the original `.git` (refs, config, hooks, index locks). An agent that can run `git` in a worktree can change branches, hooks or config of the real repository, which breaks "nothing lands unreviewed".

- The original `.git` is excluded from checkpoints and from the copy. The agent sees a plain working tree.
- Apply only changes working-tree files. HEAD, index and refs are never touched. After apply, the user sees ordinary uncommitted changes in their git UI and commits them as usual.
- If agents need git tooling later: have core run `git init` in the isolated copy and commit the baseline there (a separate throwaway repo owned by core), so `git diff`, `git log` and `git stash` work without exposing the original repo. Review and apply stay on this crate's manifests. Core should disable hooks and set `core.fsmonitor=false` in that throwaway repo, and strip its `.git` before `review_changes` (already happens, `.git` is skipped).
- A real `git worktree` with core-owned lifecycle is possible later only with a locked-down gitdir (no shared hooks or config) and branch-ownership rules. It is not needed for correctness here.

## Platform support

Tested on Linux (all tests). macOS should behave like Linux; the case-collision tests detect case-insensitive filesystems and skip the part that cannot be constructed. Windows: the crate compiles for `x86_64-pc-windows-gnu` (`cargo check --all-targets`), but the tests have not been run on Windows and these corners are unsupported or unverified:

- directory junctions and other reparse points are detected through the reparse attribute, untested; only symlink/reparse metadata is checked after open (no file-id comparison as on Unix);
- paths over 260 characters (no `\\?\` handling);
- replacing a file that another process holds open without share-delete fails with an I/O error (apply rolls back);
- hard-link-based no-clobber for new files relies on NTFS; other filesystems use the fallback;
- read-only attribute on existing files is not changed by apply, a read-only target fails with an I/O error;
- exec bit is always false, so `ModeChanged` never appears;
- NFC/NFD normalization differences (macOS, some Windows tools) are not folded in the collision check;
- directory fsync is a no-op.

Other limits: network filesystems may not honor `try_lock` or rename atomicity. The agent could fill the disk inside its copy; quotas are checked when scanning, not while it writes. Apply hashes the whole scope once (the pre-apply checkpoint), so very large projects cost one full read per apply. Unrelated symlinks in scope make checkpoint and apply fail under the default `Reject` policy; use `Skip` for such projects.

## Tests

`cargo test` in `phase1/vibespace-checkpoints` (38 tests): original untouched during isolated edits, exact binary roundtrip (3 MB random, empty, CRLF, non-UTF-8, Unicode names), idempotent and deduplicated checkpoints, `.git` exclusion, text and binary review, discard safety (forged handles), traversal and hostile manifests, symlinks (scope, isolated copy, parent swapped after baseline, target path), sockets, overlapping roots and vault, case collisions, Windows names, quotas, selection validation, conflicts (modified, deleted, already existing), selected-only apply, stale review, pre-apply backup and restore, deletion, case-only rename, permissions, injected failure rollback (4 failure points, dirs cleaned), simulated crash with recovery (plus user edit preserved during recovery), corrupt and missing objects, vault lock.
