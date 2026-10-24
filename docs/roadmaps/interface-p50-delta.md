# Interface P50 Delta — Drop shadow

## What changed
- **Schema**: `InterfaceNode` gains optional `shadow?: InterfaceShadow` ({x, y, blur, color}; absence means no shadow). `DEFAULT_INTERFACE_SHADOW` = 0/2/4/#000000.
- **Validation**: rejects non-finite offsets, negative blur and non-hex colors (`Invalid drop shadow.`).
- **Canvas**: non-text layers render `box-shadow`; text layers render `text-shadow` so the glyphs shade instead of an invisible box.
- **Properties panel**: localized `Drop shadow` DS Checkbox; when on, X/Y, blur and color fields appear.
- **Export & inspect**: SVG emits an `feDropShadow` filter per shadowed node (stdDeviation = blur/2, matching CSS blur visually) referenced from the node group; CSS inspect, layer CSS and handoff snippets emit `box-shadow`/`text-shadow`; handoff JSON rows carry `shadow`; Dev Mode shows Tailwind `shadow-[x_y_blur_color]` and SwiftUI `.shadow(color:radius:x:y:)`.
- **i18n**: drop shadow, blur and color labels in all five locales.

## Tests
- `p50Shadow.test.ts` (3): channel coverage (svg filter primitives + reference, CSS inspect, layer CSS, snippets, Tailwind, SwiftUI, handoff JSON), text to text-shadow mapping, structure/range validation + undo.
- `InterfacePanels.test.tsx`: controls render, blur fields hidden until the shadow exists, EN and DE.
- CI spec: check Drop shadow on a rectangle, assert box-shadow CSS, undo restores none.
- Suite: 417 pass / 0 fail; check:ds, check:ui-commands, check:commands, check:layers all green; tsc clean (only known studio3d/slides/Viewport3D noise filtered).

## Screenshots
Light EN and dark DE previews inspected: Gallery frame carries the default shadow; controls localized (Schlagschatten/Weichzeichner/Schattenfarbe).

## Notes
- check:ds budgets forced two choices: DS Checkbox primitive for the toggle, and the default shadow lives in the schema lib instead of a hex literal in the component.
- The SVG default filter region can clip very large offsets; blur radius maps as blur/2 stdDeviation like CSS.
- Inner shadows and multiple effects deliberately out of scope.
