# Example extensions

Install: Settings > Extensions > "Add from a .json file", pick `somnia-extension.json`, then switch the extension on. Run its command from the command palette (Ctrl+K).

- `word-count`: counts words of index.html. Permissions: commands, project.read, ui.notify.
- `section-kit`: snippets and an info panel, no permissions, no code. Index-eligible; used by the authoring kit tests.
- `css-variable-inventory`: right panel listing CSS custom properties with definitions, uses, color swatches, missing and unused tokens. Permissions: project.read. No code, index-eligible.
- `locale-parity`: right panel comparing locale JSON files against a base language (missing and extra keys, placeholder differences). Permissions: project.read, storage. No code, index-eligible.
- `safe-links`: sets target=_blank and rel=noopener noreferrer on the selected link. Permissions: commands, selection, project.write, ui.notify. The change is one undoable editor transaction.
- `accessibility-audit`: right-side panel that checks HTML files for missing alt text and names, duplicate IDs, invalid ARIA references and landmark problems. Permission: project.read. Panel only, index-eligible. Source in `panel.html`, run `node build.mjs` to regenerate the manifest.
- `seo-preflight`: right-side panel that checks title, description, canonical, robots, Open Graph, h1 and lang per HTML file, finds duplicates between files and shows a text preview (not a Google snippet). Permission: project.read. Panel only, index-eligible.
- `editorial-metrics`: right-side panel with words, characters, reading time (adjustable speed) and identical paragraphs across the project's HTML files. Permissions: project.read, storage. No code, index-eligible.
- `todo-navigator`: right-side panel that lists TODO, FIXME and HACK comments from HTML, CSS, JS and Markdown with file:line, type filter, search and grouping. Permissions: project.read, storage. No code, index-eligible.
- `local-link-check`: right panel that checks href, src and srcset references against the project files. Permission: project.read.
- `heading-outline`: right panel with the H1 to H6 outline of every HTML file. Permission: project.read.
- `data-workbench`: right panel that loads CSV, TSV or JSON files as a table and validates them. Permissions: project.read, storage.
- `form-kit`: seven accessible form snippets and a right panel that checks an HTML file. Permissions: project.read.

You can switch off any permission per extension in Settings > Extensions; the API call then fails with a clear message. See notes/ADR-003-extension-sdk.md for the API.

Both panels keep their readable source in `panel.html`. After editing it, run `node scripts/build-example-panels.mjs` to update the manifest (the tests fail when they differ).
