# Native PDF field layout, rename and delete

Base: combined comments + form designer + SVG B3, 32ae4e9
(origin/feat/queue-b3). Rebased from the delivered form head 7ecad3f.
No push/merge. This series extends the prior form package; it does not include
those commits again. The one backend operation-dispatch conflict was resolved
by retaining both comment and form operations.

## Working behavior

The native Fields panel offers Place on page (click or drag). Configure name,
type and initial properties, then arm placement. A click uses the default size;
a drag draws the rectangle. Existing coordinate creation remains available.
Placement is one-shot; Escape cancels. The page receives a dedicated hit layer
above selectable text only while field layout is active. Leaving layout restores
normal text selection. Overlapping existing widgets do not intercept placement.

Select / move / resize fields enables page widget outlines. Clicking selects the
field in the native properties panel. Drag the outline to move. Drag the blue
corner to resize. Coordinates come from the actual pdf.js viewport affine matrix,
including page rotation, additional viewer rotation, crop origin, zoom and pan.
CSS pixels rather than device-canvas pixels drive interaction. All four page
rotations and nonzero crop origin have real browser numerical roundtrip tests.

Move/draw/resize clamp to the visible crop bounds with an 8 pt minimum. Preview
moves while dragging; one actual worker edit is committed on pointer-up, not on
every pointer move. The handle follows the preview. Pointer cancel, capture loss,
window blur, Escape or a changed viewport transform discard an unfinished gesture.
Existing property controls remain the keyboard alternative. One corner resizer
changes width/height in PDF space; this is not an eight-handle layout system.

Rename updates the actual AcroForm terminal name without recreating fields or
widgets. Delete asks for confirmation and removes the field, its widgets and
page Annots references. Undo/redo restores real byte snapshots for both actions.
Deletion does not flatten appearances onto the page.

## Safety

Signed/encrypted/XFA remain view-only. Existing single-widget text/checkbox/single
select dropdowns are the supported edit targets. Multi-widget, rotated widget,
multi-select, radio/list/button/signature fields remain outside redesign scope.
Cross-page moves remain blocked. Read-only is an intentional editable design
property, not an override in the separate fill workflow.

Rename/delete reject stale snapshots, hierarchical fields, duplicate/invalid
names, and documents containing action/calculation keys, including field/widget
AA/A, JavaScript, calculation order and document OpenAction. This is conservative:
a document may be rejected because another object contains an action. No scripts
execute. No attempt is made to update script strings that refer to field names.

The pdf-lib removeField path uses an appearance reference when removing Annots;
using it alone left a risk of dangling widget references. This package resolves
actual widget dictionaries in page Annots, removes them and their indirect refs,
then removes the AcroForm field. Tests verify no field/widget ref remains.

Existing v1 limitations continue: Helvetica WinAnsi text appearances, no styling
fidelity promise, full rewrite Save copy, no automatic overwrite or recovery.
Native Windows/macOS dialogs and desktop runtime were not tested here.

## Verification (October 9, 2026)

- Core on integrated base: 1696 pass, 0 fail, 18 skipped, 26 TODO; 1740 total.
- Focused pdfedit suite on integrated base: 22 pass, 0 fail.
- Typecheck and production build pass; existing Vite warnings remain.
- Real Chrome harness `node pdf-craft/spike/form-interactions-test.mjs`:
  drag-create text, move, resize, rename, delete cancel/confirm, exact deleted
  field graph, undo/redo, click-place checked checkbox, Escape, Save copy and
  reparse. Runs on 0/90/180/270 degree pages with crop origin (20,30).
  Saved text rectangle is (90,310,200,60), checkbox at (100,240), both real widgets.
  Also checks extra viewer rotation/zoom changes the overlay. No pageerrors.
- Existing comments browser roundtrip also passes on the integrated result:
  read-only, list, edit, page jump, filter, delete, undo/redo and save, no pageerrors.
- All four saved PDFs pass qpdf --check.
- Actual light/dark and rotated screenshots inspected: outlines/resize handle
  coincide with widgets, actual text and checkbox appear, side panel is native.
- External saved PDF page inspected: moved/resized Philipp field and checked
  checkbox remain visible, no selection chrome baked into PDF.

Browser checks caught and fixed hit-layer z-order, focus scrolling during
pointer-down and a stale aborted-load callback after rapid undo/redo. The viewer
ignores callbacks from aborted document loads instead of replacing the current
page with an old Loading aborted error.

## Integration points

formDesign.ts/backend.ts extend operations; session.ts adds per-file selected
field/layout/placement state; PdfFormDesigner.tsx adds placement and lifecycle
controls. PdfViewer gets an optional overlay hook. The pdf.js page adapter adds
an optional coordinates method to the neutral page handle. Non-edit viewers and
other adapters retain their behavior when these optional hooks are absent.
No dependencies or lockfiles changed. Existing files retain surrounding format
where possible to avoid unrelated integration conflicts.
