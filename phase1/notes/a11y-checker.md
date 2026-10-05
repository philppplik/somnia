# Accessibility checker

Code: `phase1/src/lib/a11y.ts` (pure functions, no DOM). Hook: one import and one spread in `projectProblems` (`diagnostics.ts`). Results appear as warnings in the Problems panel.

Checks added here (missing alt, lang, title and heading jumps already existed in `accessibilityProblems`):

- Contrast (WCAG AA): 4.5:1 for normal text, 3:1 for large text (>=24px, or bold >=18.66px). Colours come from inline styles, `<style>` blocks and project `.css` files, for simple `tag`, `.class` and `#id` selectors, plus `body` as page default (white if unset). Cascade is approximate: later layers win, no inheritance from parent elements.
- Skipped, never guessed: `var()`, gradients, background images, semi-transparent colours, complex selectors.
- Alt text: file-name alts (`photo.png`), "image of ...", `<input type="image">` without alt.
- Headings: empty headings; first heading not h1 (full pages only).

Tests: `npx tsx --test src/lib/a11y.test.ts`. Typecheck: `npm run typecheck`.
