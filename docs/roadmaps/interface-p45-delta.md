# Interface P45 Delta — Layer rotation

## What changed
- **Schema**: `InterfaceNode` gains optional `rotation?: number` (degrees, -360 to 360 excluding 0, all layer kinds).
- **Validation**: rejects non-finite, zero and out-of-range values (`Invalid layer rotation.`); zero removes the property instead.
- **Canvas**: every layer wrapper rotates via CSS `transform: rotate(Ndeg)` about its center, children rotate with their parent.
- **Properties panel**: new `Rotation` field in degrees for any selected layer; entering 0 removes the rotation.
- **Export & inspect**: SVG adds `rotate(N cx cy)` about the layer center to the node's group transform, composing with opacity; CSS inspect, layer CSS and handoff snippets emit `transform: rotate(Ndeg)`; handoff JSON rows carry `rotation`; Dev Mode shows Tailwind `rotate-[Ndeg]` and SwiftUI `.rotationEffect(.degrees(N))`.
- **i18n**: `rotation` label in all five locales (EN/DE/ES/FR/PT-BR).

## Tests
- `p45Rotation.test.ts` (3): channel coverage (svg rotate about center, CSS inspect, layer CSS, snippets, Tailwind, SwiftUI, handoff JSON), negative angles composing with opacity, validation + undo.
- `InterfacePanels.test.tsx`: field renders for rectangles and frames in EN and DE.
- CI spec: set Rotation 45 on a rectangle, assert canvas transform matrix, undo restores 0/none.
- Suite: 398 pass / 0 fail; check:ds, check:ui-commands, check:commands, check:layers all green; tsc clean (only known studio3d/slides/Viewport3D noise filtered).

## Screenshots
Light EN and dark DE previews inspected: 15 degree rotation on the Gallery frame visibly turns the frame with its children; field localized.

## Notes
- Rotation is visual only: layout bounds stay unrotated, matching Figma's display of the original bounding box for nested layout.
- Zero is not a stored value; entering 0 deletes the property.
