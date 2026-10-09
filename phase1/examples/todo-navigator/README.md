# TODO Navigator

A right-side panel that collects TODO, FIXME and HACK comments from your HTML, CSS, JS and Markdown files.

- Every hit shows `file:line`.
- Filter by type, search the text, group by file or type.
- Rescan button. Your last filter, search and grouping are remembered.
- The panel's "What is collected" section lists the rules.

No worker code, so the package can be listed in the GitHub index. The panel cannot write to the project, use the network or react to events. Press Rescan after editing.

## Permissions

| Permission | Why |
| ---------- | --- |
| `project.read` | Reads the project's text files (including unsaved edits) to find the comments. |
| `storage` | Remembers your last type filter, search text and grouping. |

Project scripts are never run. Files are read as text, hits are written with `textContent`.

## Source

`panel.html` is the readable source. `somnia-extension.json` holds the same HTML as one string. After editing the panel, run `node scripts/build-example-panels.mjs` from `phase1`.

License: MIT, see LICENSE.
