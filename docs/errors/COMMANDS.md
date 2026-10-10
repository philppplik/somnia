# Typed command boundary

Every Tauri command call from the renderer goes through `invokeCmd` (`phase1/src/lib/invokeCmd.ts`).
Every migrated Rust command runs inside `cmd()` / `cmd_async()` (`phase1/src-tauri/src/cmd.rs`).

## Manifest

`docs/errors/commands.json` lists every command: `name`, `domain`, `status` (`native` = in the
`invoke_handler`, `planned` = Rust side lands with its package), `wrapped`, `boundary` (B1 generic wrapper,
B7 open intake), `params` (Rust snake_case), `args` (JS camelCase), `raw` (binary body, no named args).
It is generated: `node scripts/errors/gen-commands.mjs`; CI runs `npm run check:commands`.
When a command lands in Rust, remove it from `PLANNED` in the script and register it in `generate_handler!`.
Setting `wrapped: true` for a native command is part of migrating it to `cmd()`.

## Error shape

`AppCommandError` (Rust) = `CommandError` (TS): `{ id, code, message, detail?, incident_id, expected }`.
`incident_id` is a 26 character ULID minted for unexpected warn/error events and empty for expected ones.
`message` is a fixed sentence and `detail` is short; neither carries paths or secrets.
Bare strings and old `{code, message}` rejections become `SOM-APP-099` and are counted per command
(`getLegacyUntypedCounts()`).

## Logging ownership

`cmd()` writes exactly one line on `Err` (`applog::event`). Code below a command must not log the same
failure again. `invokeCmd` never logs; ACL denials go to `setCommandReporter({ aclDenied })`, rate limited to
one per command and window per minute.

## Deliberate best-effort failures

`ignore!(IgnoreReason::X, expr)` (`ignore.rs`) and `swallow(reason, x)` (`swallow.ts`) count instead of logging.
