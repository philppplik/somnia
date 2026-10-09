# Local Link & Asset Check

Checks `href`, `src` and individual `srcset` candidates in HTML files against the current project snapshot. Filter by source file and result status. Results name the source element, raw reference, resolved path and reason. Counts cover the whole snapshot, independently of filters.

## Resolution and limits

- References resolve against the source file and the first `base[href]`. Query strings do not affect file lookup. URL dot segments and percent-encoded file names/fragments are handled; path matching is case sensitive. Root-relative references use the project root.
- Binary assets are checked only through `listFiles`, never read as text. HTML IDs, legacy `a[name]` anchors and SVG IDs are checked exactly. Other fragment formats, text fragments and invalid encodings stay unchecked.
- External schemes/URLs, data URLs, dynamic template expressions, invalid srcset descriptors and ambiguous encoded path separators stay unchecked. Nothing is fetched.
- An absent explicit filename is missing **from the snapshot**, not proven missing on disk or at deployment. Absent directory paths and extensionless server routes stay unchecked: no implicit `index.html`, routing or rewrite guesses. An existing extensionless file is checked as a file.
- Only HTML `href/src/srcset` attributes are scanned, not CSS `url()`, JavaScript, Markdown, embedded `srcdoc`, or template contents. Fragments are source markup, not runtime-generated DOM. The base element sets resolution but is not itself reported as an asset reference.
- Snapshot reads are sequential, not an atomic project transaction. Refresh again if editing during a check. Any read error discards results rather than claiming a complete check.

## Permission and safety

Only `project.read` is requested: list the open project's files and read their in-memory text, including unsaved edits. No writes, network, workers, storage or selection access. A revoked permission is shown as an error in the panel. Refresh is manual; API v1 has no project-change events. An empty project is supported.

Analysis uses detached `DOMParser` documents. Project scripts are never executed and project nodes are never inserted into the live panel. Every result is displayed with `textContent`. The host's sandbox and CSP remain in place.

## Build and install

From `phase1`:

```sh
npm run ext -- validate examples/local-link-check
npm run ext -- pack examples/local-link-check
node scripts/test-project-audit-panels.mjs
```

Add the ZIP in Settings > Extensions, enable it and open its right-side panel. This is a catalog-eligible panel package, not worker code. No catalog entry is added here.

`panel.html` is the readable source. Its exact contents are embedded in `somnia-extension.json`; after editing it, update `contributes.panels[0].html` to match. The browser test checks equality. The package is MIT licensed.
