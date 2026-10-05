# Responsive breakpoints

## User flow

Open the CSS sidebar and its Responsive tab. The panel reads pixel-based
`min-width` and `max-width` conditions from project CSS files and HTML `<style>`
blocks. Each entry shows its file, line, original query and editable width.
Changing a width on blur or Enter changes only that numeric source token. The
shared Undo/Redo buttons restore the source, just like code edits.

- Preview sets the canvas width without changing visual edit scope.
- Use edit scope selects a simple max-width query and previews at that width.
- The scope selector offers Auto, Base, and discovered simple max-width widths.
- Auto keeps the old desktop/tablet/mobile behavior (base / 900 / 600 px).
- Base always writes unscoped rules, even with a mobile preview.
- An explicit max-width scope stays selected when preview size changes.
- Add query appends an empty query to the selected existing CSS file. It does
  not link that file to HTML or invent declarations. Users can edit the block
  in Code; visual edits still use the existing somnia-styles.css generator.

## Implementation

`src/lib/responsiveBreakpoints.ts` provides pure listing, validation, token
updates, query creation and edit-scope resolution. It reuses CSS source regions
from the CSS tooling feature, preserving comments and formatting. Quoted CSS
strings are masked to avoid treating string content as media rules. Edits check
current source offsets and query text before replacing anything.

`ResponsivePanel` is the third CSS panel tab. `AppState.responsiveScope` is
session UI state, not document content; connecting or closing a project resets
it to Auto. Source modifications go through ungrouped replaceSource
transactions: every width commit and addition is a distinct undo step.

Inspector, layer-context layout actions, canvas resize/padding, alignment and
distribution now resolve their breakpoint through the same `breakpointFor`
function. The main toolbar and viewport controls need no edits. Problems-panel
scope text also uses that resolver.

## Deliberate limits and risks

- Whole integer edit widths are limited to the supported preview range,
  200-3840 px. Existing decimal pixel queries are listed but cannot scope
  generated visual rules; Preview rounds them. Unsupported units, range syntax,
  orientation-only conditions and custom media are left for Code.
- Complex min/max query numbers can be edited and previewed, but complex
  conditions cannot scope visual rules. Screen/print conditions are not
  silently dropped. Only a plain max-width query (optionally all and) is offered.
- Width changes affect one occurrence, not every query of the same width.
  Generated rules are separate occurrences and stay visible separately. There
  is no hidden bulk migration, cascade reordering or breakpoint deletion.
- Scope is a numeric target, independent of source and Undo. If an Undo removes
  the selected query, the selected target stays available; the next visual edit
  can create a rule at that width. Editing a selected simple query updates the
  selected numeric target, but does not migrate other existing rules.
- Existing cascade rules, inline CSS and specificity can still win over generated
  CSS. The feature makes no new promise to override authored styles.
- The scanner is a lightweight source scanner, not a complete CSS grammar.
  Malformed CSS and unusual escaped identifiers stay a Code-editor concern.
- No filesystem format, release version, updater or native permissions changed.
  Windows disk saving and pointer interactions still need a native user test.

## Verification

- npm run build: passed (existing bundle size/dynamic import warnings remain).
- npm run test:core: 151 passed, including six new pure-function tests.
- Targeted Chromium tests: Responsive (3), CSS tooling (1), canvas (10),
  alignment/distribution (6). All passed.
- Light and dark panel screenshots inspected for spacing, readable controls,
  scroll area, source entries and the selection outline.

## Windows smoke test

1. Open a folder containing an HTML file and linked CSS. Open CSS > Responsive.
2. Add max-width 768 to the CSS file, then change it to 720. Undo and Redo.
   Open Code and confirm only the number changes. Save and reopen the folder.
3. Select a max-width scope. Change preview to Desktop, then apply an inspector
   colour to a heading. It must apply below that scope but not at Desktop.
4. Resize/pad a selected element, then align two elements in the same scope.
   Check generated CSS uses that width and Undo restores the edit.
5. Choose Base while previewing Mobile. A new colour edit must apply at Desktop.
6. Open a different project and confirm scope resets to Auto. Try an invalid
   width and a duplicate query; neither should alter the source.
