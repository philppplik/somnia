# Native PDF markup properties

Base: origin/feat/pdf-replies bc0652e on somnia-agent 769ad33.
No push/merge. Reply source tree matches delivered 0def08a.

## Implemented

Comments with a safe geometry model offer Markup properties: x/y/width/height,
RGB color and opacity. Save regenerates actual appearance streams and QuadPoints,
not a viewer-only overlay. Original annotation object ref, Contents, author, NM,
flags, popup and reply relationships stay attached. Original page text is unchanged.

Move / resize on page selects that comment's real widget rectangle in the viewer
and jumps to its page. Drag the outline to move or its blue corner to resize.
Viewport transform includes crop origin, page/view rotation, zoom and pan. One
worker edit on pointer-up, with preview and crop clamping. Escape/capture loss/
window blur/changed viewport cancel unfinished gestures. Click without meaningful
movement does not create an edit. Pointer results round to 0.01 pt for readable
native properties. Coordinate controls remain the keyboard alternative.

Text-note icons are move/color/opacity editable but retain 20 x 20 pt size. Editing
regenerates the standard Somnia note icon; an imported custom note appearance is
not preserved. Markup also uses standard regenerated appearance styling, not a
promise to retain custom AP rendering.

## Conservative eligibility

Highlight/Underline/StrikeOut need one axis-aligned quad matching Rect, accepting
common Acrobat Z order and ISO perimeter order. Multi-line, rotated/skewed or
mismatched QuadPoints, Ink and other annotation types are view-only for geometry.
Text notes need an existing 20 x 20 rectangle. Replies are geometry view-only.
Hidden/NoRotate/NoZoom/locked/read-only annotations, action/layer/effect-bearing
annotations, non-RGB colors, malformed properties and unsupported opacity are
view-only. Direct annotation dictionaries stay view-only for geometry.

Backend matches exact page/Annots slot/ref/dictionary snapshot before updating.
Signed, encrypted and XFA guards apply. New rectangles must fit crop bounds and
be at least 2 pt; notes stay 20 pt. RGB is 0-1 and opacity 5-100%. No scripts execute.
Malformed inspection returns a truthful reason without making the whole PDF
unviewable. Existing text/reply editing and parent-deletion guards are retained.

No multi-quad transformation, ink editing, free rotation, cross-page moves, whole
thread deletion or status model. No native desktop dialogs tested. English labels,
full rewrite Save copy and no automatic original overwrite as before.

## Verification

Actual browser harness creates four annotation types on 0/90/180/270 degree pages
with crop origin (20,30), changes highlight RGB/opacity/rectangle, moves/resizes
it with real pointers, changes note position/color, undo/redo and saved PDF object
readback. Original underline/strikeout remain. No pageerrors. Actual Light/Dark
and rotated screenshots inspected; external saved PDF pixels inspected. AP-backed
cyan rectangle is moved/resized, magenta note is moved, no selection chrome in PDF.

Unit tests verify original ref/author/Contents plus reply IRT survive geometry
change; AP ref changes; Rect/QuadPoints values; stale/crop/color/opacity errors;
complex/locked/reply/action/malformed annotation guards, signatures/XFA and fixed
note size. Focused: 31/31 passing. Core: 1712 pass, 0 fail, 18 skipped, 26 TODO
(1756 total). Typecheck and standard production build pass; runtime WASM was
built using Rust 1.95.0 and wasm-bindgen 0.2.129. Existing Vite warnings remain.
All four saved PDFs pass qpdf syntax checks.

Shared integration files: backend.ts/comments.ts/session.ts/PdfCommentsPanel.tsx/
PdfInlineEditor.tsx/PdfPanels.tsx. New markupProperties model and native properties/overlay UI.
No dependencies/lockfile changes. Reuses existing annotation AP builder.
