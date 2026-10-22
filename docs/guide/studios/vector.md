# Vector Studio

Status: check the release notes of your version. The hero action state is in [Hero actions](../hero-actions.md).

## Opens

SVG files.

## Blank start

Blank drawing, size 1 to 16384. Blank documents live in memory until you save them.

## Rail and panels

Files, Layers, Tools, Export, plus a Vector inspector.

## Header action

Export.... Focuses the export setup.

## Export and save

SVG download and PNG at scale 1 to 8, up to 8192 px per side.

## System fonts

Text objects and "Convert to paths" use fonts installed on the device through the browser's local-font access (`queryLocalFonts`). Supported: the Windows app and Chromium-based browsers (Chrome 103+, Edge). Not supported: the macOS and Linux apps (their web views have no local-font API) and Safari/Firefox. Where the API is missing, the feature refuses with a localized message and keeps the document unchanged.

## Limits

- Shapes become ordinary editable Bezier paths. Nothing is parametric.
- Undo and redo keep 200 document snapshots.

## Technical docs

- [Vector studio](../../studios/vector-studio.md)
- [Vector tools](../../studios/vector-tools.md)
- [Vector shell](../../studios/vector-shell.md)
- [Hero action concept](../../concepts/hero-action-vector.md)

Back to [Studios](../studios.md).
