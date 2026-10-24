# Interface P43 Delta — Corner radius for frames and rectangles

## What changed
- **Schema**: `InterfaceNode` gains optional `radius?: number` (px, 0–4096, frames and rectangles only).
- **Validation**: rejects non-finite, negative, >4096 values and radius on non-frame/rectangle kinds (`Invalid corner radius.`).
- **Canvas**: frames/rectangles render with `border-radius` and clip children/image fills to the rounded shape.
- **Properties panel**: new `Corner radius` field (frame/rectangle selections only); entering 0 removes the radius.
- **Export & inspect**: SVG emits `rx` on rects and clip paths (clamped to half the smaller side); CSS inspect, layer CSS, handoff snippets emit `border-radius`; handoff JSON rows carry `radius`; Dev Mode shows Tailwind `rounded-[Npx]` and SwiftUI `.cornerRadius(N)`.
- **i18n**: `cornerRadius` label in all five locales (EN/DE/FR/ES/JA).

## Tests
- `p43Radius.test.ts` (3): channel coverage (svg rect rx, clip path, CSS, snippets, Tailwind, SwiftUI), clamping to half the smaller side, validation + undo.
- `InterfacePanels.test.tsx`: field renders for frames and rectangles in EN and DE, hidden for text layers.
- CI spec: set Corner radius on a rectangle, assert canvas CSS, undo restores 0.
- Suite: 390 pass / 0 fail; check:ds, check:ui-commands, check:commands, check:layers all green; tsc clean (only known studio3d/slides/Viewport3D noise filtered).

## Screenshots
Light EN and dark DE previews inspected: 24px radius on the Gallery frame visibly rounds corners and clips children; field localized.

## Notes
- Radius is uniform (single value per node); per-corner radii deliberately out of scope.
- Rendering clamps to `min(radius, width/2, height/2)` like Figma; stored value is not rewritten.
