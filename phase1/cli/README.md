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
