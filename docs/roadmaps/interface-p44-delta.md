# Interface P44 Delta — Layer opacity

## What changed
- **Schema**: `InterfaceNode` gains optional `opacity?: number` (0–1 fraction, all layer kinds).
- **Validation**: rejects non-finite, negative and >=1 values (`Invalid layer opacity.`); fully opaque stays the absence of the property.
- **Canvas**: every layer wrapper renders with CSS `opacity`, so frames fade whole subtrees.
- **Properties panel**: new `Opacity` field in percent (0–99 stores a fraction, 100 removes the property) for any selected layer.
- **Export & inspect**: SVG wraps each translucent node group with an `opacity` attribute (children inherit); CSS inspect, layer CSS and handoff snippets emit `opacity`; handoff JSON rows carry `opacity`; Dev Mode shows Tailwind `opacity-[0.5]` and SwiftUI `.opacity(0.5)`.
- **i18n**: `opacity` label in all five locales (EN/DE/ES/FR/PT-BR).

## Tests
- `p44Opacity.test.ts` (3): channel coverage (svg group, CSS inspect, layer CSS, snippets, Tailwind, SwiftUI, handoff JSON), frame opacity fading the whole svg subtree, validation + undo.
- `InterfacePanels.test.tsx`: field renders for rectangles and frames in EN and DE, stored fraction maps to percent.
- CI spec: set Opacity 50 on a rectangle, assert canvas CSS 0.5, undo restores 100/1.
- Suite: 394 pass / 0 fail; check:ds, check:ui-commands, check:commands, check:layers all green; tsc clean (only known studio3d/slides/Viewport3D noise filtered).

## Screenshots
Light EN and dark DE previews inspected: 50% opacity on the Gallery frame visibly fades the frame and its children; field localized.

## Notes
- Opacity is stored as a fraction (0–1); the panel works in percent like Figma.
- 100% is represented by removing the property, keeping documents minimal.
