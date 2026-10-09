# Native annotation creation

Base: somnia-agent 49af8d5, 11.3.0-beta.3. No push or merge.

## Implemented

The native Add panel now has a separate Create annotation section for Highlight,
Underline, StrikeOut and Text note, with comment, color and opacity controls.
The old fixed-size coordinate-only annotation shortcut is replaced, not duplicated.

Draw markup on page arms a one-shot rectangle tool. Drag a rectangle over the
page; the actual edit is committed once on pointer-up. A simple click does not
create accidental tiny markup. Place text note on page uses a click to place a
20 x 20 pt note icon. Empty text notes are refused. Escape or the cancel button
leaves no annotation. Pointer cancel, lost capture and window blur discard the
unfinished gesture. Switching page or tools cancels pending annotation placement.
The field-layout tool and annotation-placement tool are mutually exclusive.

The tool uses the actual pdf.js viewport inverse matrix, including page rotation,
crop origin, zoom and pan. Positions clamp to visible crop bounds. Coordinate
placement remains available under a disclosure, with editable width/height for
markup. Coordinates are PDF user-space points; note coordinates are its top-left
anchor. Coordinate controls are the keyboard alternative.

## Real PDF objects and appearances

Creates /Annot objects with /Highlight, /Underline, /StrikeOut or /Text subtype,
/Rect, /P, /C, /CA, /Contents, unique /NM, timestamp and Print flag. Markup writes
real /QuadPoints. All four types have an /AP /N Form XObject; the note now has its
own colored paper/line icon instead of relying on a viewer to invent one. Highlight
uses Multiply and opacity; underline and strikeout use actual stroke appearances.
Unicode comment Contents are PDFHexString text, independent of page fonts.

New annotations appear in the existing Comments panel and can be edited/deleted
there. Editing plain comment text retains the annotation's appearance. The original
page text remains unchanged; this is markup, not redaction or text replacement.
Author is deliberately empty unless supplied through the backend; the UI does not
invent the current user's name. No PDF actions/scripts are created or executed.
Existing annotations are retained. The shared export helper also adds page refs
and validates resolved annotation inputs before building appearances.

Undo/redo and Save copy use the existing worker/session byte snapshots. Original
files are not overwritten automatically. Saves rewrite the full PDF, not append
incrementally. Pending tool settings are not durable recovery data.

## Guards and scope

Signed, encrypted and XFA PDFs stay view-only through the existing backend gate.
New inline creation supports these four types only, not ink/signatures/forms/links.
Reject invalid pages, non-finite/out-of-crop/tiny rectangles, invalid colors,
opacity outside 5-100%, comments over 20,000 characters, authors over 200 characters,
more than 500 rectangles per annotation and more than 10,000 annotations total.
Markup has a 2 pt minimum rectangle, notes require a 20 pt crop-contained icon.

This is rectangle placement, not semantic text-selection-to-multi-line-quad markup.
No automatic word alignment or freehand ink is claimed. Existing comments editing
limitations, reply/lock guards and native-save limitations remain unchanged.
Visible labels are English. No Windows/macOS desktop dialog test was performed.

## Verification (October 9, 2026)

- Core: 1699 pass, 0 fail, 18 skipped, 26 TODO, 1743 total.
- Combined pdfedit/pdfannotate focused suite: 32 pass, 0 fail.
- Typecheck and production build pass. Existing Vite warnings remain.
- `node pdf-craft/spike/annotation-create-test.mjs`: actual Chrome UI and worker,
  create all four types from a PDF with no annotations on 0/90/180/270 degree
  pages with crop origin (20,30); precise rectangle/page/AP/QuadPoints readback;
  comment-edit after creation, undo/redo, click guard and Escape; downloaded saved
  copies reopen with real objects and Unicode contents. No pageerrors.
- Existing comments UI regression passes (imported objects, edit/delete,
  page jump/filter, undo/redo/save). Existing field interaction browser regression
  passes on all four rotations, including rename/delete/drag/resize/save.
- All four annotation saved PDFs pass qpdf --check.
- Actual Light/Dark, creation-tools and rotated-page screenshots inspected.
  Highlight covers the first line, green underline sits beneath the second,
  red strikeout crosses the third and blue note icon renders. Native Comments
  lists all four new objects. Creation controls fit the native Add panel.
- External saved PDF page rendered and inspected: all four actual appearances
  remain visible, underlying text is readable. This is not screenshot-only proof.

## Apply

Apply the three git-am patches on 49af8d5. Shared integration points are backend.ts,
session.ts, PdfPanels.tsx, PdfInlineEditor.tsx and pdfannotate/export.ts. No dependency
or lockfile changes. Preserve existing comments/form operations when integrating.
