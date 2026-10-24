# Interface P48 Delta — Text decoration (underline and strikethrough)

## What changed
- **Schema**: `InterfaceNode` gains optional `textDecoration?: 'underline'|'line-through'` (text layers only; None is the absence of the property).
- **Validation**: rejects non-text kinds and values outside the enum (`Invalid text decoration.`).
- **Canvas**: text content renders with CSS `text-decoration`.
- **Properties panel**: new localized `Text decoration` select (None/Underline/Strikethrough) for text layers only.
- **Export & inspect**: SVG sets `text-decoration` on the `<text>` element; CSS inspect, layer CSS and handoff snippets emit `text-decoration`; handoff JSON rows carry `textDecoration`; Dev Mode shows Tailwind `underline`/`line-through` and SwiftUI `.underline()`/`.strikethrough()`.
- **i18n**: `textDecoration` plus the three option labels in all five locales.

## Tests
- `p48TextDecoration.test.ts` (3): channel coverage for underline (svg text-decoration, CSS inspect, layer CSS, snippets, Tailwind, SwiftUI, handoff JSON), line-through mappings, kind/enum validation + undo.
- `InterfacePanels.test.tsx`: select renders for text layers, hidden for frames, EN and DE.
- CI spec: choose Underline on a text layer, assert canvas CSS text-decoration-line, undo restores None.
- Suite: 409 pass / 0 fail; check:ds, check:ui-commands, check:commands, check:layers all green; tsc clean (only known studio3d/slides/Viewport3D noise filtered).

## Screenshots
Light EN and dark DE previews inspected: the "Welcome to Somnia" heading renders underlined; select localized (Textdekoration/Unterstrichen).

## Notes
- One decoration at a time (Figma's common case); combining underline + strikethrough deliberately out of scope.
- Overline is not offered, matching Figma.
