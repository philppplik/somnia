# Example extensions

Install: Settings > Extensions > "Add from a .json file", pick `somnia-extension.json`, then switch the extension on. Run its command from the command palette (Ctrl+K).

- `word-count`: counts words of index.html. Permissions: commands, project.read, ui.notify.
- `safe-links`: sets target=_blank and rel=noopener noreferrer on the selected link. Permissions: commands, selection, project.write, ui.notify. The change is one undoable editor transaction.

You can switch off any permission per extension in Settings > Extensions; the API call then fails with a clear message. See notes/ADR-003-extension-sdk.md for the API.
