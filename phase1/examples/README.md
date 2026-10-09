# Example extensions

Install: Settings > Extensions > "Add from a .json file", pick `somnia-extension.json`, then switch the extension on. Run its command from the command palette (Ctrl+K).

- `word-count`: counts words of index.html. Permissions: commands, project.read, ui.notify.
- `section-kit`: snippets and an info panel, no permissions, no code. Index-eligible; used by the authoring kit tests.
- `safe-links`: sets target=_blank and rel=noopener noreferrer on the selected link. Permissions: commands, selection, project.write, ui.notify. The change is one undoable editor transaction.

You can switch off any permission per extension in Settings > Extensions; the API call then fails with a clear message. See notes/ADR-003-extension-sdk.md for the API.
- `editorial-metrics`: right-side panel with words, characters, reading time (adjustable speed) and identical paragraphs across the project's HTML files. Permissions: project.read, storage. No code, index-eligible.
- `todo-navigator`: right-side panel that lists TODO, FIXME and HACK comments from HTML, CSS, JS and Markdown with file:line, type filter, search and grouping. Permissions: project.read, storage. No code, index-eligible.

Both panels keep their readable source in `panel.html`. After editing it, run `node scripts/build-example-panels.mjs` to update the manifest (the tests fail when they differ).
