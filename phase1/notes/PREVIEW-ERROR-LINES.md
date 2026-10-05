# Live preview error source locations

Implemented on `feature/preview-error-lines`, based on v9.18.0 (`8fb685e`).

## Behaviour

Runtime errors, JavaScript parse errors, and Error-based promise rejections show
`file:line:column` in the existing preview error panel when a source position is
known. Click that error to open the file at the reported position. The HTML
preview stays open when the linked JavaScript file becomes the active source tab.
Errors without a known source position remain plain text, rather than showing a
misleading generated-document line. The existing ten-error limit and Dismiss
button are unchanged.

## Implementation

- `buildPreview` returns the srcDoc HTML, a per-script source map, and a unique
  preview generation ID. `buildPreviewDoc` is retained as a compatibility wrapper.
- parse5 records inline script content start positions in the original HTML.
  Temporary per-build attributes match scripts through DOMParser's HTML
  normalization. parse5 then records content positions in the final srcDoc.
  This handles implied head/body tags, relocated scripts, serialized attribute
  escaping, injected bridge/CSP, and inlined CSS. No regex HTML parser is used.
- Each executable script gets a generated `sourceURL`. Runtime locations and
  rejection stack frames use script-relative positions; inline scripts map back
  to their original HTML start line and first-line column. Linked scripts resolve
  relative to the HTML file, without query/hash fragments, and start at line 1.
- Chromium reports document-relative positions for script parse failures even
  when `sourceURL` names the script. SyntaxError objects with no call frames are
  treated as parse failures. A thrown SyntaxError with call frames is a runtime
  error. Final srcDoc positions map parse failures back to the original source.
- The parent verifies the frame window and generation ID, so a late message
  cannot be mapped against a newer document. The generation ID is not a security
  secret; opted-in project scripts can still send messages from their own frame.
- `previewErrorLocation.ts` is a pure mapping helper. Bounds checks reject invalid
  coordinates. The React component uses existing `jumpToLine` navigation.
- parse5 8.0.0 is now a direct shell dependency, the same version already used by
  editor-core. npm hoists it and entities instead of adding new parser versions.

## Boundaries

This is a browser-reported JavaScript location map, not a transpiler source map.
Network scripts/modules, imports requiring network access, inline event-handler
attributes, eval/new Function sources, CSS syntax errors and HTML validation are
not covered. Resource failures and string rejections have no source link.
JavaScript source maps for bundled/minified code are not interpreted. Location
links are diagnostic, not trusted author instructions. Browser-specific syntax
error coordinates need Windows WebView2 testing; Chromium is covered here, not
Firefox/WebKit. Linked JS containing literal closing-script text is escaped by
existing preview behaviour; columns after that escape on the same line can be
off by the extra backslash. Lines remain correct. Parsing the HTML twice per
refresh adds work for very large files; no new project-wide background scan is
introduced.

## Validation

Commands from `phase1`:

```
npm run test:core
npm run build
npx playwright test tests/preview-error-lines.spec.ts tests/live-preview.spec.ts tests/preview-svg.spec.ts tests/linked-preview.spec.ts --workers=2
```

Tests cover multiple inline scripts, linked JS in nested folders, runtime and
parse failures, Error promise rejections, plain rejections/resource failures,
CRLF input, same-line columns, modules, thrown SyntaxError objects, inert
scripts, quoted `>` attributes, click navigation and stale-generation messages.
The new click target has an accessible name containing file, line, column and
error message. A screenshot of the real split view confirms the error link is
visible and readable in the existing panel.

## Windows check

1. Open an HTML project with `<script src="runtime.js"></script>` and create
   `runtime.js` with two blank lines then `throw new Error("Windows test");`.
2. Toggle live preview and choose Run scripts. Check `runtime.js:3:7`, then click
   the error. The JS tab should open with the cursor on line 3; HTML stays visible.
3. Put `const broken = ;` on line 2 in that JS file. Refresh and check the link
   points to line 2, not a line in the generated preview document.
4. Try an inline HTML script and `Promise.reject(new Error("async test"))`.
   Confirm their links open the expected HTML/JS lines.
5. Turn scripts off: no script runs and no error link appears. Re-enable, fix the
   source, and confirm refresh clears old errors. Dismiss should still work.

No release version, merge, push, or native installer changes are included.
