# Design hero action: Export

Status: implemented locally; see [implementation](../studios/design-hero-export.md) and [verification](../studios/hero-creative-verification.md).

## Hero action

**Export**, icon `Download`, split button. Main part opens an export popover for the active artboard. Chevron: `Export artboard as SVG`, `Export project (.somdesign)`, `Publish...`.

## Why

Canva, Figma and Affinity all end design work in an export or share step, and Canva keeps download formats one click away under Share. In Design today the two export actions are small outline buttons in the canvas bar (`Export project`, `Export SVG`), easy to miss and not tied to the header.

## Present is not the hero

Figma shows a Present control for prototypes. Somnia Design has no prototype mode in this studio, so Export is the honest primary action.

## UX

- Popover: scope (current artboard, all artboards), format (SVG now; PNG and PDF marked as later), file name preview, `Export` button. Below it a separate row: `Save project as .somdesign` for the editable source.
- Scope "all artboards" exports one file per artboard, or a zip when more than three. Needs a decision, see questions.
- Disabled with tooltip "Create or open a design" when no document is open.
- Shortcut `Mod+Shift+E` (same as Photos, as both are Export). Check collisions.
- Success note inline in the popover with the file name; errors inline, never silent.

## Reuses

- `design.exportSvg` (artboard to SVG, `exportArtboardSVG`).
- `design.exportProject` (`serializeDesignDocument`, `.somdesign`).
- `design.artboard.select` to choose scope.
- `deploy.open` for Publish.

## Needs

- New command `design.export.open` for the popover.
- PNG export: rasterise the SVG on a canvas at 1x/2x/3x. Reasonable and small if fonts are loaded; flag as phase 2.
- PDF export: depends on the vector/PDF core; not claimed here.
- "All artboards" loop and zip packaging reuse the project export helpers; verify.
- i18n in 5 locales, tests for scope and disabled states.

## Effort

Small to medium: about 1 day for the popover with SVG and project export, plus about 1 day for PNG. PDF is not estimated.

## Open questions for Philipp

1. Is SVG-only acceptable for the first release, with PNG next?
2. For "all artboards": separate files or one zip?
