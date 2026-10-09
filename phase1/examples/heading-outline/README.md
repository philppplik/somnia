# Heading Outline

Lists H1–H6 from every HTML file in DOM order. Filter by file, heading level or headings with notes. Counts cover the whole snapshot, independently of filters. Indentation is capped for narrow panels.

A rise of more than one level is marked (H2 → H4, for example). A first heading below H1 is also noted. Previous levels reset for every file, and jumps are computed before filtering. Empty headings and additional H1s are review notes, not automatic compliance failures. Heading text is whitespace-normalized; script, style and template text is excluded.

This is source markup parsed with the HTML parser, not CSS visibility, an accessibility-name computation or a rendered accessibility tree. An image-only heading can have no source text even if its image has alternative text. Template contents and runtime-generated headings are not included. No editor jump is offered because API v1 has no navigation method.

Snapshot reads are sequential, not atomic. Refresh again if editing while scanning. Any read error discards results rather than showing a partial outline as complete.

## Permission and safety

Only `project.read` is requested: list the open project's files and read their in-memory text, including unsaved edits. No writes, network, workers, storage or selection access. A revoked permission is shown as an error in the panel. Refresh is manual; API v1 has no project-change events. An empty project is supported.

Analysis uses detached `DOMParser` documents. Project scripts are never executed and project nodes are never inserted into the live panel. Every result is displayed with `textContent`. The host's sandbox and CSP remain in place.

## Build and install

From `phase1`:

```sh
npm run ext -- validate examples/heading-outline
npm run ext -- pack examples/heading-outline
node scripts/test-project-audit-panels.mjs
```

Add the ZIP in Settings > Extensions, enable it and open its right-side panel. This is a catalog-eligible panel package, not worker code. No catalog entry is added here.

`panel.html` is the readable source. Its exact contents are embedded in `somnia-extension.json`; after editing it, update `contributes.panels[0].html` to match. The browser test checks equality. The package is MIT licensed.
