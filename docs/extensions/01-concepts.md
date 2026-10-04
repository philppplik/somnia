# 1. Concepts

An extension is one JSON file, `somnia-extension.json`, that describes the extension (a manifest) and optionally carries a small JavaScript program (`code`). Round 1 has no marketplace and no remote code: you install a file you have.

## What an extension can contribute

| Contribution | Needs code | Where it shows up |
| ------------ | ---------- | ----------------- |
| Commands | yes | Command palette (Ctrl+K) and the menu bar category you choose |
| Snippets | no | Command palette as "Snippet: name (Extension)"; HTML snippets insert into the selected container, CSS and JS snippets copy to the clipboard |
| Code themes | no | Settings > Code editor > Syntax theme, marked "(extension)" |
| Panels | no (HTML) | An icon in the left or right rail; the panel body is your HTML |

Declarative contributions (snippets, themes, panel HTML) never run extension code in the app.

## Two kinds of running code

- **Worker code** (`code` in the manifest): runs in a sandboxed Web Worker with the `somnia` API. Used for commands.
- **Panel code** (script inside a panel's HTML): runs in a sandboxed iframe with a read-only `window.somnia`.

Both talk to Somnia only through JSON messages. Every call is checked against the permissions in the manifest. See [Security model](07-security.md).

## Principles

- Local first: no network access, no accounts.
- Off by default: an installed extension does nothing until the user enables it.
- Least privilege: declare only what you need; users can revoke individual permissions.
- Undoable: extensions change the project through editor operations, which land in the normal undo history. They never write to disk directly.

Next: [Manifest reference](02-manifest.md).
