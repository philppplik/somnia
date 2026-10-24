# Interface P49 Delta — Flip horizontal and vertical

## What changed
- **Schema**: `InterfaceNode` gains optional `flipH?: boolean` and `flipV?: boolean` (true only; absence means unflipped).
- **Validation**: rejects anything but literal `true` (`Invalid layer flip.`) — false removes the property.
- **Canvas**: layers mirror via CSS `scale(-1, 1)`/`scale(1, -1)`, composed with rotation in one transform.
- **Properties panel**: two localized DS Checkbox toggles (Flip horizontal / Flip vertical) for any selected layer.
- **Export & inspect**: SVG appends a center-pivot `translate/scale/translate` flip to the node group transform; CSS inspect, layer CSS and handoff snippets emit a combined `transform` (rotate then scale); handoff JSON rows carry `flipH`/`flipV`; Dev Mode shows Tailwind `-scale-x-100`/`-scale-y-100` and SwiftUI `.scaleEffect(x:y:)`.
- **i18n**: both labels in all five locales.

## Tests
- `p49Flip.test.ts` (3): channel coverage (svg center-pivot scale, CSS inspect, layer CSS, snippets, Tailwind, SwiftUI, handoff JSON), rotate+flip composition in one transform, boolean validation + undo.
- `InterfacePanels.test.tsx`: toggles render for rectangles and frames, EN and DE.
- CI spec: check Flip horizontal on a rectangle, assert mirrored matrix, undo restores none.
- Suite: 413 pass / 0 fail; check:ds, check:ui-commands, check:commands, check:layers all green; tsc clean (only known studio3d/slides/Viewport3D noise filtered).

## Screenshots
Light EN and dark DE previews inspected: the orange triangle path points down after Flip vertical; toggles localized (Horizontal/Vertikal spiegeln).

## Notes
- Flips pivot about the layer's own center, matching Figma.
- check:ds required the DS Checkbox primitive instead of a raw input; migrated accordingly.
