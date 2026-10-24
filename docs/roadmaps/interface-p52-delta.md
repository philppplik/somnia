# Interface P52 Delta — Linear gradient fills

## What changed
- **Schema**: `InterfaceGradient {angle, stops[]}` (2-8 stops, offset 0-1 sorted, hex6 colors) as optional `gradient` on any node; `DEFAULT_INTERFACE_GRADIENT` (90deg, #7756e8 to #38bdf8) plus shared helpers `interfaceGradientCSS` and `interfaceGradientVector`.
- **Validation**: rejects bad angle (not 0-360), fewer than 2 or more than 8 stops, unsorted offsets, out-of-range offsets and non-hex colors (`Invalid gradient.`).
- **Canvas**: frames/rectangles render `background: linear-gradient(...)`; ellipses and closed paths get a real `linearGradient` def in their inline SVG; text keeps its solid fill (gradient text out of scope).
- **Properties panel**: localized `Gradient` DS Checkbox (hidden for text); when on, angle field plus start/end color fields appear (editing first and last stop).
- **Export & inspect**: SVG emits a `linearGradient` def per gradient node (angle mapped to an objectBoundingBox vector) referenced from rect, ellipse and closed path fills; CSS inspect, layer CSS and handoff snippets emit `background: linear-gradient(...)` instead of `background-color`; handoff JSON rows carry `gradient`; Dev Mode shows Tailwind `bg-[linear-gradient(...)]` and SwiftUI `LinearGradient` with the angle snapped to the 8 unit points.
- **i18n**: gradient, angle, start and end color labels in all five locales (Verlauf/Verlaufswinkel/Startfarbe/Endfarbe).

## Tests
- `p52Gradient.test.ts` (3): channel coverage (svg def + stops + reference, CSS helper, inspect, layer CSS, snippets, Tailwind, SwiftUI, handoff JSON), ellipse/path svg rendering with the default gradient, structure/range validation + untoggle/undo.
- `InterfacePanels.test.tsx`: controls render, fields hidden until the gradient exists, EN and DE.
- CI spec: check Gradient on a rectangle, assert background-image is a linear-gradient, undo restores none.
- Suite: 425 pass / 0 fail; check:ds, check:ui-commands, check:commands, check:layers all green; tsc clean (only known slides-engine WASM noise).

## Screenshots
Light EN and dark DE previews inspected: Gallery frame carries a 45deg purple-to-blue gradient; controls localized (Verlauf/Verlaufswinkel/Startfarbe/Endfarbe).

## Notes
- The panel edits the first and last stop; multi-stop gradients (2-8 stops) are supported in schema, validation and every export channel, but stop editing beyond start/end is deliberately out of scope.
- SwiftUI unit-point snapping approximates arbitrary angles to the nearest 45 degrees.
- Radial gradients and gradient text deliberately out of scope.
