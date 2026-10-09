# Accessibility Audit

A side panel that checks the HTML files of the open project for common accessibility problems. It reports findings with file, line and element. It does not claim WCAG conformance.

## What it checks (per HTML file)

- Alt text and names: images without `alt`, alt text that is a file name, image buttons and map areas without text, form fields, buttons and links without an accessible name.
- IDs and ARIA: duplicate IDs, `label for` targets that do not exist, `aria-labelledby` and other ID reference lists that point at missing IDs, focusable elements hidden with `aria-hidden`.
- Landmarks and page: missing or repeated `main`, several `nav` or `aside` landmarks without labels, missing `lang`, missing `title`. Partial files (no `html` or `body` tag) skip the page-level checks.

Not checked: color contrast, keyboard use, focus order, quality of alt text, content added by scripts. An empty `alt=""` is treated as valid.

## Permissions

| Permission | Why |
| ---------- | --- |
| `project.read` | Lists the project files and reads the HTML text (including unsaved changes) to analyze it. |

No network, no writing, no storage, no worker code. Files are parsed with `DOMParser` into an inert document: project scripts never run. All result text is set with `textContent`. The panel does not receive change events, so press Re-check after editing.

## Files

- `panel.html`: readable source of the panel.
- `build.mjs`: `node build.mjs` writes `somnia-extension.json` from `panel.html` (the panel HTML must be inline in the manifest).
- `somnia-extension.json`: the package manifest. Index-eligible (no worker code).

Try it: `npm run ext -- validate examples/accessibility-audit`, then `npm run ext -- pack examples/accessibility-audit` and install the ZIP in Settings > Extensions.
