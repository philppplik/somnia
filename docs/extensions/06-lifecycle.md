# 6. Lifecycle

## States

1. **Installed**: the manifest is validated and stored in the app profile. Nothing runs.
2. **Enabled**: the user switched the extension on in Settings > Extensions. Contributions become active.
3. **Active**: commands, snippets, themes and panels are registered. If the manifest has `code`, one worker starts and the code runs once.
4. **Disabled or removed**: contributions are removed, the worker is terminated, open panels close.

Extensions are off after install. The enabled flag and revoked permissions are stored per profile and kept across restarts.

## Activation

When the set of enabled extensions or their permissions changes, Somnia tears down all extension contributions and activates the enabled ones again. Your `code` therefore runs again; keep it idempotent and store state with `storage`, not in globals.

Activation order within `code`:

1. Top-level statements run in order, `await` is allowed.
2. `somnia.commands.register` binds handlers. Command handlers can only be registered for commands declared in the manifest.
3. If the code throws, the worker reports the error in the status bar notice and the commands of that extension report that no handler is registered.

## Command run

When the user runs a command, the host sends `command.run` to the worker. The handler has 5 seconds to finish. On timeout the user sees a notice; the worker is not killed, so avoid loops that never end. Errors thrown by the handler are shown as a notice.

## Idle suspend

Somnia can suspend the worker of an extension that has been idle, and start it again when it is needed. This follows the extensions bucket of the lifecycle resource profile (64 MiB on the normal profile, see [Studio lifecycle](../studio-lifecycle.md)).

- A worker is suspended after 5 minutes without activity, or after 1 minute when the lifecycle manager reports memory pressure.
- If the running workers exceed the extensions bucket, the least recently used ones are suspended first, whatever their idle time.
- A worker is never suspended while a command is running, or during its first 10 seconds.
- Commands, snippets, themes, accent palettes and panels are declarative and stay available while the worker is suspended.
- Running a command resumes the worker. Your `code` runs again, exactly as on activation, so keep it idempotent and keep state in `storage`, not in globals.
- Suspending does nothing when the lifecycle manager is turned off in settings.

Implementation: `phase1/src/lib/extensions/idleSuspend.ts`. `activateExtensions(list, idle)` in `host.ts` enables it when the optional `idle` options are passed; without them nothing changes.

## Updates

Installing a manifest with the same `id` replaces the stored one. The enabled flag and revoked permissions stay as they were. See [Versioning](11-versioning.md).

## Persistence

| Data | Where | Cleared by |
| ---- | ----- | ---------- |
| Manifest | app profile (browser storage or app data) | Remove |
| Enabled flag, revoked permissions | app profile | Remove (enabled flag), manual re-check |
| `storage` values | app profile, prefixed with the extension id | Clearing app data |

Next: [Security model](07-security.md).
