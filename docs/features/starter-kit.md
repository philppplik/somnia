# Starter kit: ready-made components with variants

Branch: `comp/starter-kit` (base: PR #109 `feature/component-system`). Status: Draft.

## What it does
The Components tab gets an **Add starter kit** button. It adds six components to the personal library, each with two variants:

| Component | Variants |
|---|---|
| Starter Navigation | Simple, With button |
| Starter Hero | Centered, Split with image |
| Starter Card | Basic, Image on top |
| Starter Pricing | Three plans, Single plan |
| Starter Footer | Simple, Columns |
| Starter Form | Contact, Newsletter |

Insert and "Replace selection" work as for any component, so a placed Hero can be switched between its variants in one edit (one Undo).

## Rules the blocks follow
- **No `id` attributes.** Form fields sit inside their `<label>`, so the same block can be inserted twice without the repeated-ID check firing.
- **Self-contained styling.** Each block has one root element with a `<style>` inside it, scoped by a unique class (`sk-nav-simple`, ...). Nothing leaks into other page CSS. Trade-off: the CSS repeats per inserted copy; move it to a shared stylesheet when a project grows.
- **Responsive.** Flex-wrap, CSS grid `auto-fit` and `clamp()` type. Checked at 1100 px and 390 px wide: no horizontal scroll.
- **Accessible.** Named landmarks (`nav aria-label`, `footer`, `section aria-label`), visible labels for every field, `autocomplete` hints, alt text and width/height on images, visible focus ring, text and button colours at WCAG AA contrast. Only the Hero uses `h1`; other blocks start at `h2`/`h3`.
- No scripts, no event handlers. Forms post to `#` as a placeholder.
- Image placeholders are local inline SVG data URIs (no external requests); replace with real images.

## Behaviour of "Add starter kit"
- Adds only what is missing (matched by id or name, case-insensitive). Clicking again changes nothing.
- Never overwrites or removes a user's own component, even with the same name.
- Stops at the 40-component library limit and reports what was added.

## Where the code is
- `phase1/src/lib/starterKit.ts`: data and `addStarterKit`. Pure, no DOM or storage.
- `phase1/src/components/ComponentSystemPanel.tsx`: one import and one button (only shared-file edit).
- Tests: `src/lib/starterKit.test.ts` (9 unit tests), `tests/component-library.spec.ts` (one new e2e test).

## Known limits
- Library is stored per app profile (localStorage), as in the component system.
- Texts are English placeholders and not wrapped for i18n yet.
