# Somnia extensions

Extensions add commands, snippets, code themes and side panels to Somnia without changing the app. They run offline, are off until you switch them on, and can only do what their declared permissions allow.

Applies to: Somnia v9.5 and later, extension `apiVersion` 1.

| # | Page | Read it when you want to |
| - | ---- | ------------------------ |
| 1 | [Concepts](01-concepts.md) | understand what an extension is and what it can contribute |
| 2 | [Manifest reference](02-manifest.md) | write or validate `somnia-extension.json` |
| 3 | [Permissions](03-permissions.md) | know what each permission allows and how users revoke it |
| 4 | [API reference](04-api-reference.md) | call the host from extension code (`somnia.*`) |
| 5 | [Panels](05-panels.md) | add a side panel with your own HTML |
| 6 | [Lifecycle](06-lifecycle.md) | know when your code starts, runs and stops |
| 7 | [Security model](07-security.md) | understand the sandbox and its limits |
| 8 | [Tutorial](08-tutorial.md) | build Hello World up to Word count |
| 9 | [Packaging and install](09-packaging-install.md) | ship and install an extension |
| 10 | [Troubleshooting](10-troubleshooting.md) | fix install and runtime errors |
| 11 | [Versioning](11-versioning.md) | plan for API changes |

Working examples are in [`phase1/examples/`](../../phase1/examples/README.md). The design record is [ADR-003](../../phase1/notes/ADR-003-extension-sdk.md).

## Quick start

1. Save [this manifest](08-tutorial.md#step-1-hello-world) as `somnia-extension.json`.
2. In Somnia open Settings > Extensions > Add from a .json file.
3. Switch the extension on, press Ctrl+K and run its command.
