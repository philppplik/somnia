# 3. Permissions

Permissions are declared in the manifest and checked by the host on every API call. An extension without a permission gets an error such as `project.readFile needs the "project.read" permission, which Hello did not declare.`

| Permission | Allows | API |
| ---------- | ------ | --- |
| `commands` | Declare commands and register their handlers | `commands.register` |
| `project.read` | Read the open project files from memory | `project.listFiles`, `project.readFile` |
| `project.write` | Change the project through editor operations | `editor.applyOperations` |
| `selection` | Read the selected element (id and tag) | `selection.get` |
| `ui.notify` | Show a short status bar notice | `ui.notify` |
| `storage` | Keep small per-extension key/value data | `storage.get`, `storage.set` |

There is no network, filesystem, clipboard or DOM permission in `apiVersion` 1.

## What the user sees and controls

- Settings > Extensions lists each extension with every declared permission as a checkbox.
- Unchecking a permission revokes it immediately. The manifest is not changed; the host removes the permission before running the extension, so the next call fails with the message above.
- Revocations are stored per extension id in the app profile and survive restarts. Checking the box restores the permission.
- Removing the extension deletes its manifest and its enabled flag.

## Choosing permissions

- Ask only for what the feature needs. `project.write` is the most sensitive; keep write commands explicit and small.
- Handle denial: wrap calls in `try/catch` and tell the user what to enable (`await somnia.ui.notify(...)` needs `ui.notify`, so also handle the case where even that is revoked).
- Declaring `commands` is required as soon as the manifest contains command contributions.

Next: [API reference](04-api-reference.md). Security background: [Security model](07-security.md).
