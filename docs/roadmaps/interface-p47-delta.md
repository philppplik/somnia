# Interface P47 Delta — Text alignment

## What changed
- **Schema**: `InterfaceNode` gains optional `textAlign?: 'left'|'center'|'right'` (text layers only; Left/default is the absence of the property).
- **Validation**: rejects non-text kinds and values outside the enum (`Invalid text alignment.`).
- **Canvas**: the text content container aligns lines via CSS `text-align`.
- **Properties panel**: new localized `Text alignment` select (Left/Center/Right) for text layers only.
- **Export & inspect**: SVG moves each line's `tspan` x to half/full layer width with `text-anchor` middle/end; CSS inspect, layer CSS and handoff snippets emit `text-align`; handoff JSON rows carry `textAlign`; Dev Mode shows Tailwind `text-center`/`text-right` and SwiftUI `.multilineTextAlignment(.center/.trailing)`.
- **i18n**: `textAlign` plus the three option labels in all five locales.

## Tests
- `p47TextAlign.test.ts` (3): channel coverage (svg text-anchor + tspan x, CSS inspect, layer CSS, snippets, Tailwind, SwiftUI, handoff JSON), right alignment anchoring at the layer width, kind/enum validation + undo.
- `InterfacePanels.test.tsx`: select renders for text layers, hidden for frames, EN and DE.
- CI spec: choose Center on a text layer, assert canvas CSS, undo restores default.
- Suite: 405 pass / 0 fail; check:ds, check:ui-commands, check:commands, check:layers all green; tsc clean (only known studio3d/slides/Viewport3D noise filtered).

## Screenshots
Light EN and dark DE previews inspected: the "Welcome to Somnia" heading centers inside its layer; select localized (Textausrichtung/Zentriert).

## Notes
- List items keep their markers at the line start; alignment applies to the text lines (markers stay put).
- Justify deliberately out of scope.
