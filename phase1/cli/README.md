# somnia-cli (headless core, slice 1 part 1/2)

`somnia run "task" [--print|--json] [--bare] [--detach] [--yes] [--studio S] [--branch B] [--request-id ID] [--attribution] [--allow-root DIR]`,
`somnia attach|status|cancel <task-id>`.

- Exit codes: 0 done, 1 failed, 2 needs-input / review-required.
- `--yes` = local commit on the task branch only. The git layer has a subcommand allowlist with no fetch/pull/push/clone/remote.
- IPC: NDJSON protocol v1 over a same-user local transport. Unix: socket in a 0700 runtime dir (socket 0600, peer-uid check). Windows: named pipe `\\.\pipe\somnia-cli-<user-sid>-<repo>-<task>` whose DACL grants the current user only, first-instance claim fails closed against squatting, remote clients are rejected at the pipe level, and both ends verify the peer process runs as the same user. No HTTP port on either; credential-like fields are rejected.
- Engine: `TaskEngine` trait; `SidecarEngine` speaks `somnia.task-engine/1` over stdio (`SOMNIA_ENGINE_CMD`, `<exe-dir>/sidecar/engine.mjs`, or `cli/sidecar/engine.mjs` in a checkout). The sidecar (`sidecar/engine.ts`) runs the desktop agent session and tools headless; build it with `npm run build:cli-engine` in `phase1/`. Contract, configuration and error codes: [docs/agent/TASK-ENGINE-CONTRACT.md](../../docs/agent/TASK-ENGINE-CONTRACT.md).
- Desktop bridge (assumed, desktop must write it): `.somnia/gui-state.json`, see `src/guard.rs`.
- Session records: `.somnia/sessions/<task>.json`, excluded locally via `.git/info/exclude` (private by default).
- `--bare`: the engine sends only the task prompt (no `AGENTS.md`, no studio hint).
- Not built: ratatui TUI beyond the protocol adapter is tracked in docs/cli.

Tests: `cargo test` (needs `node` and `git`; the real-sidecar tests skip unless `sidecar/engine.mjs` is built) and `npm run test:cli-engine` in `phase1/`. Runs on ubuntu and windows-latest in CI; `tests/transport_windows.rs` covers the named-pipe transport.

## `somnia run --tui-stdio`

Adapter mode for `somnia-tui` (protocol v1, NDJSON with `"v":1`, stdout = frames only, commands on stdin).
Core events map to the TUI schema (`status`, `text_delta`, `needs_input`, `guard_blocked` for review-required, `done`).
Without `--yes` the agent's uncommitted work is proposed as one `diff_proposed` per file; `review_decision` is applied only if
`content_hash` (S12: `sha256(file \0 (hunk.id \0 lines.join("\n") \0)*)`, module `review`) matches both the proposal and the
current worktree and every hunk is named once. Otherwise `guard_blocked` and the review stays pending. Rejected hunks are
reverse-applied; accepted hunks stay uncommitted (the commit gate remains manual). Questions: with the `answer` capability the run waits for `answer` after `needs_input` (see [docs/cli/TUI-PROTOCOL.md](../../docs/cli/TUI-PROTOCOL.md)). `tool-call`/`tool-result` map to `tool_call`/`tool_result`, `usage` to `status` (`cost_usd` is 0 while the provider reports no price), `model` re-announces `session_started` with the model.

## Install

Release archives (Linux and Windows, x86_64; no macOS build) are attached to GitHub Releases, including alphas:
`somnia-cli-<version>-linux-x86_64.tar.gz` and `somnia-cli-<version>-windows-x86_64.zip`, with `SHA256SUMS`.

```sh
sha256sum -c SHA256SUMS --ignore-missing
tar -xzf somnia-cli-<version>-linux-x86_64.tar.gz
mkdir -p ~/.local/share ~/.local/bin
mv somnia-cli-<version>-linux-x86_64 ~/.local/share/somnia-cli
ln -sf ~/.local/share/somnia-cli/somnia ~/.local/bin/somnia
somnia --version        # release number; the long form (--version) also prints commit and target
```

On Windows, extract the zip, put the folder on `PATH`, then run `somnia --version` (PowerShell: `Get-FileHash <zip> -Algorithm SHA256` and compare with `SHA256SUMS`).
The binary is unsigned (SmartScreen may warn). It needs `git` and `node` (20 or newer) on `PATH`. The archive carries the agent engine as `sidecar/engine.mjs` next to the binary; keep it there (a symlink to the binary is fine).
Windows: foreground and detached runs, `attach`, `status` and `cancel` all work; background runs talk over a per-user named pipe (see `docs/cli/security.md`).

## Building and packaging

```sh
cd phase1/cli && cargo build --release --locked            # version = crate version unless SOMNIA_RELEASE is set
cd phase1 && npm ci && node scripts/package-cli.mjs build # runs build:cli-engine, then packs binary + sidecar/engine.mjs; archive + .sha256 in phase1/cli-dist, version from somniaRelease
node scripts/package-cli.mjs sums cli-dist                 # SHA256SUMS for all archives in the folder
```

`SOMNIA_RELEASE` and `SOMNIA_COMMIT` are compile-time inputs the script sets. CI wiring: [BUILD-AND-RELEASE.md](../../docs/BUILD-AND-RELEASE.md).
Integration tests under `cli/tests` are Unix only (`#![cfg(unix)]`).

## Install (scripts)

The release assets include non-interactive installers. They download only from the GitHub Release of
`philppplik/somnia`, verify the archive against `SHA256SUMS` before touching anything, and are safe to run again
(a rerun replaces the installed version).

Linux (x86_64) and macOS (Apple Silicon):

```sh
curl -fsSL https://github.com/philppplik/somnia/releases/download/<tag>/install.sh | sh
# or: sh install.sh [--version <tag>] [--prefix DIR] [--no-path]
```

Windows (x64):

```bat
install.bat
rem or: powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 [-Version <tag>] [-Prefix DIR] [-NoPath]
```

- Linux installs to `~/.local/share/somnia-cli` and links `~/.local/bin/somnia`; if `~/.local/bin` is not on `PATH`,
  one marked line is added to `~/.profile`, `~/.bashrc` and `~/.zshrc` (once). `--no-path` skips that.
- Windows installs to `%LOCALAPPDATA%\Programs\somnia-cli` and adds that folder to the user `PATH` (once). No admin rights needed.
  `install.bat` runs PowerShell hidden and prints the log at the end, so no extra console window appears.
- Without a version the newest release (pre-releases included) that carries a CLI archive is used.
- macOS installs the same way as Linux (`~/.local/share/somnia-cli`), Apple Silicon only, no Intel build; the installer clears the quarantine flag after the checksum check.
- `git` and Node 20+ must be on `PATH`. The Linux binary is built on Ubuntu 22.04 and needs glibc 2.35 or newer.
