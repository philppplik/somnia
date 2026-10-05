# CSS tooling (variables panel and class manager)

Branch: `feature/css-tooling`. A new left-sidebar panel (paintbrush icon "CSS", command "CSS variables and classes").

## What it does
- **Variables tab**: lists every custom property (`--name: value`) found in `.css` files and in `<style>` blocks of `.html` files, with its scope selector, usage count (`var(--name)`) and file. Edit a value inline (Enter or blur applies). Hex colours get a colour picker. Click a name to jump to its line. "Add" appends a variable to the first `:root` block of the first CSS file, or creates one.
- **Classes tab**: lists every class with how often it is defined in CSS selectors (d) and used in HTML `class` attributes (u). Flags "unused" (defined, never used) and "undefined" (used, never defined). Rename updates CSS selectors and HTML class attributes in all files.

## How it works
- `phase1/src/lib/cssTools.ts`: pure functions, no I/O. Comments are blanked with spaces so offsets stay valid. Variables are parsed from flat `{}` blocks (also inside `@media`). Edits are offset-based string splices.
- `phase1/src/components/CssPanel.tsx`: UI. Every change goes through `applyOperations([{type:'replaceSource'}])`, so it is one undo step per action (rename across files is one step).
- Shared files touched (one line each): `store/appStore.ts` (`LeftTab` adds `'css'`), `components/IconRail.tsx` (rail item), `components/LayersPanel.tsx` (tab content), `lib/commands.ts` (command `css.open`).

## Limits
- Regex-based, not a full CSS parser: nested CSS (`&` nesting) and variables set in inline `style=""` attributes are not listed. Selectors inside `:is()`/`:not()` are handled as normal class selectors.
- Rename refuses a name that already exists (no merging) and invalid identifiers. Classes built at runtime in JS are not renamed.
- Class `to` names with escapes (e.g. `md\:flex`) are not supported.

## Tests
- `npm run test:core` includes `src/lib/cssTools.test.ts` (7 tests).
- `npx playwright test tests/css-tools.spec.ts`.
