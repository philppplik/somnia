# Deploy commands and guard rails

Design: [live deployment concept](concepts/live-deployment.md), sections 10 and 11. This page says what is built for the command layer.

## Command ids

| Id | Level | Who can run it |
| --- | --- | --- |
| `deploy.targets.list` | read | every origin, including agent and MCP |
| `deploy.plan` | propose | every origin. Read-only connect, returns the plan, stages it for the human. No upload. |
| `deploy.publish`, `deploy.rollback` | ui | people only (`ui`, `palette`, `menu`, `shortcut`) |
| `deploy.target.save`, `deploy.target.delete` | ui | people only |
| `deploy.hostkey.trust`, `deploy.hostkey.replace`, `deploy.key.create` | ui | people only |

There is no `execute` level. `ui` level already refuses agent and MCP origins in the dispatcher (`forbidden-origin`), and the agent tool bridge only registers read and propose specs. Each state-changing handler also checks the origin itself, so extension, macro, cli and the dev control channel cannot publish either.

## Confirmation token

1. `deploy.publish` asks Rust for a plan and shows the dialog (target, pinned fingerprint, exact file list).
2. The approving click calls `captureGesture(event)`: trusted DOM event, user activation, usable once, 60 s.
3. Only then the renderer asks Rust for a token (`deploy_confirm_issue`). Rust mints tokens only for plan hashes it produced.
4. `deploy_publish` consumes the token first (one use, 120 s, bound to the plan hash), then plans again against the live server. If the hash differs, nothing is uploaded (`deploy:plan-changed`).

No parameter, flag, setting or schedule can carry or skip the token. Every publish and rollback asks again.

## Rust

`deploy_guard.rs` holds the rules and is tested against mocks. `deploy_targets.rs` stores target metadata. `deploy_runtime.rs` is the one place that picks the engine, pin store and key maker. `deploy_commands.rs` is the Tauri glue (12 commands, trusted editor window only, errors are `deploy:<code>` strings).
