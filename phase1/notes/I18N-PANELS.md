# Panels and Inspector translation tranche

Based on `feature/i18n` at `e33289f`.

- Panel bodies, forms, accessible names, tooltips, placeholders, confirmations and locally produced notices use `useT()` and `panels.*` keys.
- Areas: files, layers, elements, CSS, responsive breakpoints, problems, project search, component library, props/slots, library import/export, component browser, variant tools, extension iframe title, Inspector and element metrics.
- German values are machine translated. The English catalogue remains the base.
- Plurals use the layer's `{count}` convention; multiple independent counts are translated separately, then interpolated into a sentence.
- CSS property names and values, source HTML, filenames, component/variant names, extension-provided content, stored enum values and accordion IDs are not translated.
- Locale changes update mounted panels without changing selection, accordion state or CSS properties.
- Long component actions wrap within their panel. Inspector labels have more room for German; box-model dimensions are rounded to one decimal to avoid float noise overflowing the smaller labels.
- Messages originating from `lib/diagnostics`, `fileOps`, `cssTools`, `projectSearch`, `componentSystem`, `componentActions`, `variantEditing` and `libraryShare` remain the owning library's messages. This tranche does not modify those shared modules or translate errors heuristically. Template HTML and starter-kit names/content remain authored data.

## Validation

- `npx tsc -b --pretty false`
- `npm run test:core`
- Playwright: `i18n-panels`, `i18n`, `inspector-metrics`, `files-panel`, `project-search`, `css-tools`, `responsive-breakpoints`, `component-props`, `component-library`, `component-browse`, `library-share`
- `i18n-panels` covers live language changes, German Inspector/Files/CSS/component controls, preserved technical values, selection/accordion state and search plurals.
- German screenshots inspected: Inspector, responsive panel, component library. Screenshot outputs are temporary test artifacts, not tracked.
