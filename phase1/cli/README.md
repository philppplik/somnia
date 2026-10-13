# somnia-cli (headless core, slice 1 part 1/2)

`somnia run "task" [--print|--json] [--bare] [--detach] [--yes] [--studio S] [--branch B] [--request-id ID] [--attribution] [--allow-root DIR]`,
`somnia attach|status|cancel <task-id>`.

- Exit codes: 0 done, 1 failed, 2 needs-input / review-required.
- `--yes` = local commit on the task branch only. The git layer has a subcommand allowlist with no fetch/pull/push/clone/remote.
- IPC: NDJSON protocol v1 over a Unix socket in a 0700 runtime dir (socket 0600, peer-uid check). No HTTP port; credential-like fields are rejected.
- Engine: `TaskEngine` trait; `SidecarEngine` speaks `somnia.task-engine/1` over stdio (`SOMNIA_ENGINE_CMD` or `sidecar/engine.mjs`). S9's contract plugs in by implementing the trait.
- Desktop bridge (assumed, desktop must write it): `.somnia/gui-state.json`, see `src/guard.rs`.
- Session records: `.somnia/sessions/<task>.json`, excluded locally via `.git/info/exclude` (private by default).
- Not built: Windows named pipe (stub returns a typed error), `--bare` effect (forwarded to the engine only), ratatui TUI.

Tests: `cargo test` (needs `node` and `git`).

## `somnia run --tui-stdio`

Adapter mode for `somnia-tui` (protocol v1, NDJSON with `"v":1`, stdout = frames only, commands on stdin).
Core events map to the TUI schema (`status`, `text_delta`, `needs_input`, `guard_blocked` for review-required, `done`).
Without `--yes` the agent's uncommitted work is proposed as one `diff_proposed` per file; `review_decision` is applied only if
`content_hash` (S12: `sha256(file \0 (hunk.id \0 lines.join("\n") \0)*)`, module `review`) matches both the proposal and the
current worktree and every hunk is named once. Otherwise `guard_blocked` and the review stays pending. Rejected hunks are
reverse-applied; accepted hunks stay uncommitted (the commit gate remains manual). Not yet mapped: `tool_call`/`tool_result`/`model`/cost (the engine contract carries none).

## Install

Release archives (Linux and Windows, x86_64; no macOS build) are attached to GitHub Releases, including alphas:
`somnia-cli-<version>-linux-x86_64.tar.gz` and `somnia-cli-<version>-windows-x86_64.zip`, with `SHA256SUMS`.

```sh
sha256sum -c SHA256SUMS --ignore-missing
tar -xzf somnia-cli-<version>-linux-x86_64.tar.gz
install -m 0755 somnia-cli-<version>-linux-x86_64/somnia ~/.local/bin/somnia
somnia --version        # release number; the long form (--version) also prints commit and target
```

On Windows, extract the zip, put the folder on `PATH`, then run `somnia --version` (PowerShell: `Get-FileHash <zip> -Algorithm SHA256` and compare with `SHA256SUMS`).
The binary is unsigned (SmartScreen may warn). It needs `git` on `PATH`, and `node` for the default agent sidecar.
Windows limits: foreground `somnia run` only. Detached runs, `attach`, `status` and `cancel` need the Unix socket transport (named pipe not built).

## Building and packaging

```sh
cd phase1/cli && cargo build --release --locked            # version = crate version unless SOMNIA_RELEASE is set
cd phase1 && node scripts/package-cli.mjs build            # archive + .sha256 in phase1/cli-dist, version from somniaRelease
node scripts/package-cli.mjs sums cli-dist                 # SHA256SUMS for all archives in the folder
```

`SOMNIA_RELEASE` and `SOMNIA_COMMIT` are compile-time inputs the script sets. CI wiring: [BUILD-AND-RELEASE.md](../../docs/BUILD-AND-RELEASE.md).
Integration tests under `cli/tests` are Unix only (`#![cfg(unix)]`).
