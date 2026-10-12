# Live preview architecture

The live preview runs a project's HTML page in a sandboxed iframe, with the page's own CSS, JavaScript, images, fonts and media taken from the project folder. It replaces the design canvas while open and never changes source files. Navigation between pages is described in [live-preview-navigation.md](live-preview-navigation.md).

## Pipeline

1. `previewResources.ts` (resolver). `scanHtmlRefs` lists what the active HTML links: `link`, `script`, `img`/`source`/`video`/`audio`/`track`, `srcset`, `poster`, inline `style` attributes and `<style>` blocks, SVG `use`/`image`, favicon, and relative imports inside inline scripts. `loadPreviewResources` loads those files breadth first through the native `read_project_resource` command and follows CSS `@import`/`url()` and ES module imports. Open editor buffers win over disk for text files. Failures are collected, never thrown.
2. `mergeTextResources` combines editor text and loaded text. Stylesheet `@import` rules are flattened (see below).
3. `buildPreview` (`livePreview.ts`) parses the HTML and replaces linked stylesheets and scripts with inline `<style>`/`<script>`, rewrites module imports, swaps asset references for data URLs, installs the navigation bridge and error bridge, and adds the CSP.
4. `buildPreviewWithResources` (`livePreviewResources.ts`) ties 1 to 3 together. Without a project folder (in-memory project) it falls back to the plain asset build.
5. `previewDeps.ts` computes the page's dependency graph and decides how to update a running preview: nothing, hot-swap linked CSS in place, or full rebuild. `previewAssetWatch.ts` re-checks binary assets on disk.

## Sandbox

`sandbox="allow-scripts"` only: opaque origin, no same-origin, popups, forms or top navigation. The CSP is `default-src 'none'`, inline scripts and `data:` scripts only (a nonce-only policy when scripts are off), `img-src`/`font-src`/`media-src` limited to `data:` (images also `blob:`), `connect-src 'none'`. There is no network access. Because an opaque origin cannot resolve relative URLs or load `blob:` scripts, every project file the page uses is inlined.

## Path resolution

`resolveProjectPathStrict` is the single resolver for text resources. It strips the query and fragment, decodes percent escapes (`my%20file.css` finds `my file.css`), folds `.` and `..`, treats `/x` as project-root relative and returns `escape` when `..` leaves the project. Backslashes, NUL bytes, external URLs, `data:`/`blob:` and bare fragments resolve to nothing. `buildPreview` and the asset helpers apply the same rules, except that root-relative (`/x`) references are not inlined by `buildPreview` or the asset helpers (see Limits).

## CSS

The iframe inlines stylesheets, where a relative `@import` cannot load. `flattenCssImports` (and `flattenCss` in `previewDeps.ts`) replace each `@import` of a project stylesheet with its text, recursively, drop cycles, turn a media list into `@media`, and re-point `url()` references to the importing file's folder. An `@import` with `layer()` or `supports()` is left as written, because it cannot be expressed as `@media`. Unterminated comments hide the rest of the file, as in browsers.

## ES modules

`previewModules.ts` rewrites every relative import specifier (static, re-export and dynamic with a string literal) to a `data:text/javascript;base64,...` URL of the imported module, whose own imports were rewritten first. Equal content gives an equal URL, so a module imported from two places is one instance. Bare specifiers and absolute URLs are left alone. A `sourceURL` comment keeps stack traces mapped to project files, and line numbers are preserved. A cycle cannot be expressed with `data:` URLs: the import that closes it points at an empty module and the chain is reported in the banner.

## Text encoding

Text resources are decoded by `decodeResourceBytes`: UTF-16 by BOM, UTF-8 (BOM removed), and Windows-1252 when the bytes are not valid UTF-8. This matches how the editor opens files.

## Banner

Problems are shown above the preview, not in the page: blocked external URLs (`finish2.preview.blocked`), project files that could not be loaded with the reason, such as not found, too large, outside the project, limit reached (`finish2.preview.unloaded`), module import cycles (`finish2.preview.moduleCycles`) and script errors with file and line (`finish2.preview.errors`). When an external script such as an animation library was blocked, reveal-on-scroll content is shown in its end state.

## Limits

| Limit | Value | Where |
| --- | --- | --- |
| Files read per build | 300 | `MAX_RESOURCE_FILES` |
| Bytes read per build | 40 MB | `MAX_RESOURCE_TOTAL_BYTES` |
| Link depth (CSS and module chains) | 8 | `MAX_RESOURCE_DEPTH` |
| Image / font / media asset | 8 / 4 / 24 MB | `KIND_LIMIT` |
| Total cached asset data | 64 MB | `TOTAL_LIMIT` |
| Unopened HTML read for navigation | 8 MB | `read_project_resource` |

Other limits:

- Static site only: no server, no query strings and no network (`fetch` and XHR are blocked by the CSP).
- Dynamic `import()` is followed only with a string literal. Computed specifiers and import maps are not resolved.
- Root-relative references (`/img/a.png`) are loaded by the resolver for text files and navigation, but binary assets and `buildPreview` links use document-relative paths only.
- A module first reached through an import cycle keeps the empty stub for the edge that closed the cycle, even if it is later imported from elsewhere.
- `<base>`, `<iframe>`, `<object>` and `<embed>` are removed.

## Tests

Unit: `previewResources.test.ts`, `previewModules.test.ts`, `previewDeps.test.ts`, `previewAssets.test.ts`, `previewEdgeCases.test.ts` (encodings, limits, odd markup, reload sequences, `layer()` imports). End to end (`phase1/tests`): `preview-unopened-resources`, `preview-es-modules`, `preview-binary-assets`, `preview-error-lines`, `preview-navigation`, `preview-animations`, `preview-edge-cases`.
