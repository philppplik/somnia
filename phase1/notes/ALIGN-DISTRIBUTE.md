# Align, distribute and spacing guides

Branch: `feature/align-distribute` (base `phase1-foundation`).

## What it does
Select two or more elements on the design canvas (Shift+click). A toolbar appears at the top of the canvas:
- Align left, horizontal centers, right, top, vertical middles, bottom. Reference is the bounding box of the whole selection.
- Distribute horizontally / vertically. Equal gaps between elements, the two outermost stay put. Needs three or more.
- Spacing guides overlay: pink lines where edges or centers coincide; red labels with the pixel gap between neighbouring elements (green when all gaps on that axis are equal). Gaps are only drawn between elements that overlap on the other axis.

Locked elements (and children of locked layers) are skipped. One click is one undo step.

## Modules
| File | Role |
|---|---|
| `src/lib/alignDistribute.ts` | Pure geometry: `alignDeltas`, `distributeDeltas`, `gapGuides`, `edgeGuides`, `shiftStyle`. No DOM, no store. |
| `src/lib/alignApply.ts` | Measures the selection in the iframe, turns deltas into `setStyle` operations, applies them in one `applyOperations` call. |
| `src/components/AlignToolbar.tsx` | The toolbar. |
| `src/components/SpacingGuides.tsx` | Guide overlay, drawn inside the scaled canvas, pointer-transparent. |
| `src/components/DesignCanvas.tsx` | Touched in 3 places: two imports, one `<SpacingGuides>` and one `<AlignToolbar>` element. |
| `src/styles/global.css` | `.align-toolbar` rules appended. |

## How elements are moved
The editor core only writes class rules (`.element-xxxx`), so moving is done with CSS offsets:
- `position: absolute | fixed`: new `left` / `top` (and `right`/`bottom: auto`).
- `position: relative | sticky`: shifted `left` / `top`.
- static: becomes `position: relative` with `left` / `top`. The element keeps its slot in the flow, only its painted position moves.
Breakpoint handling matches the resize handle (820 view writes a max-width 900 rule, 390 view a 600 rule).

## Known limits
- An `id` selector or an inline `style` in the user's own CSS out-ranks the generated class rule. Inline conflicts raise the core's `inline-cascade` notice and nothing moves; id-selector conflicts silently have no visible effect (same as the existing resize handle).
- Absolute elements stretched by both `left` and `right` shrink to content once `right` becomes `auto`.
- Guides are drawn for the current selection only, not live while dragging (canvas drag reparents elements, it does not free-position them).
- Measured in the iframe viewport; scrolled preview content is not compensated (same as the selection box).

## Tests
- `npm run test:core` includes `src/lib/alignDistribute.test.ts` (geometry, 8 tests).
- `npx playwright test tests/align-distribute.spec.ts` (6 tests: toolbar visibility, align left with undo, align bottom, distribute with equal-gap guides, static elements, locked elements).
