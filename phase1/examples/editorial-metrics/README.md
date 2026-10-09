# Editorial Metrics

A right-side panel that shows how much text your HTML files contain and which longer paragraphs repeat across the project.

- Words, characters and reading time per file and in total.
- Reading speed is adjustable (100 to 600 words per minute, default 240) and remembered.
- Identical paragraphs of 12 or more words, listed with the files they appear in.
- Optional: leave `nav` and `footer` out of all counts.
- The panel's "How things are counted" section lists every rule.

Repeated text is a hint, not a verdict. The panel does not compare against outside sources and makes no plagiarism claim.

No worker code, so the package can be listed in the GitHub index. The panel cannot write to the project, use the network or react to events. Press Rescan after editing.

## Permissions

| Permission | Why |
| ---------- | --- |
| `project.read` | Reads the project's HTML files (including unsaved edits) to count text. |
| `storage` | Remembers your reading speed, the nav/footer option and the selected view. |

Project scripts are never run. Files are parsed with `DOMParser` and results are written with `textContent`.

## Source

`panel.html` is the readable source. `somnia-extension.json` holds the same HTML as one string. After editing the panel, run `node scripts/build-example-panels.mjs` from `phase1`.

License: MIT, see LICENSE.
