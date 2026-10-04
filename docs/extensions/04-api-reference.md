# 4. API reference

Worker code receives a frozen global `somnia` object. All methods are asynchronous and return promises. Arguments and results are plain JSON; the host never hands out object references.

The code runs as the body of an async function, so you can use top-level `await`. A failed call rejects with an `Error` whose message says what was wrong.

Panels get a smaller, read-only `window.somnia`, see [Panels](05-panels.md).

## `somnia.commands.register(id, handler)`

Permission: `commands`. Binds `handler` (a function, async allowed) to a command declared in `contributes.commands`.

- `id` must be declared in the manifest, otherwise: `Command ids must be declared in the manifest.`
- The handler runs when the user picks the command. It must finish within 5 seconds, otherwise the user sees `<name> did not finish in time.`
- Register handlers at the top level of `code`, once.

## `somnia.project.listFiles()`

Permission: `project.read`. Resolves to a sorted array of file paths in the open project, for example `["index.html", "styles.css"]`.

## `somnia.project.readFile(path)`

Permission: `project.read`. Resolves to the text of the file from the in-memory editor, including unsaved changes. Rejects with `File not found in the open project.` for unknown paths.

## `somnia.selection.get()`

Permission: `selection`. Resolves to `{ "id": "<node id>", "tag": "h1" }` or `null` when nothing is selected. The `id` is the editor node id you pass to operations.

## `somnia.editor.applyOperations(ops)`

Permission: `project.write`. Applies 1 to 50 structured operations as one editor transaction. The change appears in the normal undo history and is not written to disk by the extension; saving stays with the app.

Each operation is an object with a `type` and a `file` that exists in the open project. Allowed types:

| `type` | Fields | Effect |
| ------ | ------ | ------ |
| `setText` | `nodeId`, `text` | Replace the text of an element |
| `setAttribute` | `nodeId`, `name`, `value` (`null` removes) | Set or remove an attribute |
| `setStyle` | `nodeId`, `properties` (map, `null` removes), optional `cssFile`, `breakpoint` | Change CSS declarations |
| `insertHTML` | `parentId`, `html`, optional `beforeId` | Insert markup |
| `remove` | `nodeId` | Delete an element |
| `move` | `nodeId`, `parentId`, optional `beforeId` | Move an element |
| `formatText` | `nodeId`, `from`, `to`, `mark` (`strong`, `em`, `u`) | Format a text range |

Rules and errors:

- `replaceSource` is rejected: `Operation type replaceSource is not allowed.`
- A file outside the project: `Operation file must be a file of the open project.`
- More than 50 operations, or none: `editor.applyOperations needs 1 to 50 operations.`
- Each operation is limited to about 100 KB of JSON.
- The call resolves to the number of operations applied.

Example:

```js
const sel = await somnia.selection.get();
await somnia.editor.applyOperations([
  { type: 'setAttribute', file: 'index.html', nodeId: sel.id, name: 'rel', value: 'noopener' }
]);
```

## `somnia.storage.get(key)` and `somnia.storage.set(key, value)`

Permission: `storage`. Per-extension key/value store in the app profile.

- Keys are strings up to 100 characters. Values are strings up to 20000 characters.
- `get` resolves to the string or `null`.
- Other extensions cannot read your keys. The host prefixes keys with the extension id. Store JSON as a string with `JSON.stringify`.

## `somnia.ui.notify(text)`

Permission: `ui.notify`. Shows `text` in the status bar notice, cut to 200 characters.

## Error summary

| Message | Cause |
| ------- | ----- |
| `Unknown API method: <name>` | Typo or a method that does not exist in `apiVersion` 1 |
| `<method> needs the "<permission>" permission, which <name> did not declare.` | Missing or revoked permission |
| `Extension is not active.` | The extension was disabled while a panel was open |

Next: [Panels](05-panels.md).
