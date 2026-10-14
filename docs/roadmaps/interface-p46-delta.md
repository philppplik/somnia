# Interface P46 Delta — Layer blend mode

## What changed
- **Schema**: `InterfaceNode` gains optional `blendMode?: BlendMode` with a curated Figma-basic set: multiply, screen, overlay, darken, lighten (Normal is the absence of the property).
- **Validation**: rejects anything outside the enum (`Invalid blend mode.`).
- **Canvas**: layers render with CSS `mix-blend-mode`, so a layer mixes with everything painted beneath it.
- **Properties panel**: new localized `Blend mode` select (Normal removes the property) for any selected layer.
- **Export & inspect**: SVG puts `style="mix-blend-mode:..."` on the node's group; CSS inspect, layer CSS and handoff snippets emit `mix-blend-mode`; handoff JSON rows carry `blendMode`; Dev Mode shows Tailwind `mix-blend-multiply` and SwiftUI `.blendMode(.multiply)`.
- **i18n**: `blendMode` label in all five locales (EN/DE/ES/FR/PT-BR); mode names stay English like in design tools.

## Tests
- `p46Blend.test.ts` (2): channel coverage (svg group style, CSS inspect, layer CSS, snippets, Tailwind, SwiftUI, handoff JSON), enum validation + undo.
- `InterfacePanels.test.tsx`: select renders for rectangles and frames in EN and DE.
- CI spec: choose Multiply on a rectangle, assert canvas CSS, undo restores Normal.
- Suite: 401 pass / 0 fail; check:ds, check:ui-commands, check:commands, check:layers all green; tsc clean (only known studio3d/slides/Viewport3D noise filtered).

## Screenshots
Light EN and dark DE previews inspected: Multiply on the Gallery frame visibly mixes it with the canvas and the frame beneath; select localized.

## Notes
- Five curated modes cover the common design cases; color-dodge, hue family etc. deliberately out of scope.
- SVG blend rendering depends on the viewer's CSS support, matching what browsers do with the canvas.
