# SEO Preflight

A side panel that checks the metadata of the HTML files in the open project. It runs offline and makes no ranking promises.

## What it checks (per full HTML page)

- `title`, meta description, canonical link, robots meta (flags `noindex`), `og:title`, `og:description`, `og:image`, the main `h1` and the `lang` attribute.
- Duplicates between files: same title, description, canonical link or h1.
- A text preview of title, address and description. It is a rough sketch, not a Google snippet.

Length hints (title about 10 to 60 characters, description about 50 to 160) are editorial guide values, not search engine rules. Canonical and Open Graph URLs are checked as text only, never opened. Partial files (no `html` or `head` tag) are skipped.

## Permissions

| Permission | Why |
| ---------- | --- |
| `project.read` | Lists the project files and reads the HTML text (including unsaved changes) to analyze it. |

No network, no writing, no storage, no worker code. Files are parsed with `DOMParser` into an inert document: project scripts never run. All result text is set with `textContent`. The panel does not receive change events, so press Re-check after editing.

## Files

- `panel.html`: readable source of the panel.
- `build.mjs`: `node build.mjs` writes `somnia-extension.json` from `panel.html`.
- `somnia-extension.json`: the package manifest. Index-eligible (no worker code).

Try it: `npm run ext -- validate examples/seo-preflight`, then `npm run ext -- pack examples/seo-preflight`.
