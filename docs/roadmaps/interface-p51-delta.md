# Interface P51 Delta — Layer blur

## What changed
- **Schema**: `InterfaceNode` gains optional `blur?: number` (layer blur radius in px; absence means no blur).
- **Validation**: rejects non-finite, zero, negative or >1024 blur (`Invalid layer blur.`).
- **Canvas**: blurred layers render `filter: blur(Npx)` on the node wrapper, covering fills, children and text alike.
- **Properties panel**: localized `Layer blur` DS Checkbox; when on, a blur radius field appears (clamped 1-1024).
- **Export & inspect**: SVG emits an `feGaussianBlur` filter (stdDeviation = blur/2, matching CSS visually); a node with both blur and drop shadow gets one combined filter containing both primitives, shadow-only nodes keep the P50 `shadow-<id>` filter. CSS inspect, layer CSS and handoff snippets emit `filter: blur(Npx)`; handoff JSON rows carry `blur`; Dev Mode shows Tailwind `blur-[Npx]` and SwiftUI `.blur(radius: N)`.
- **i18n**: layer blur and radius labels in all five locales (Ebenenunschärfe/Unschärferadius).

## Tests
- `p51Blur.test.ts` (3): channel coverage (svg primitive + reference, CSS inspect, layer CSS, snippets, Tailwind, SwiftUI, handoff JSON), blur+shadow combined filter, range validation + untoggle/undo.
- `InterfacePanels.test.tsx`: controls render, radius field hidden until blur exists, EN and DE.
- CI spec: check Layer blur on a rectangle, assert filter CSS, undo restores none.
- Suite: 421 pass / 0 fail; check:ds, check:ui-commands, check:commands, check:layers all green; tsc clean (only known studio3d/slides/Viewport3D noise filtered).

## Screenshots
Light EN and dark DE previews inspected: Gallery frame blurred at 6px with localized controls.

## Notes
- Blur applies to the whole layer subtree, matching Figma's layer blur; background blur (backdrop-filter) deliberately out of scope.
- stdDeviation maps as blur/2 like CSS blur, same convention as the P50 drop shadow.
