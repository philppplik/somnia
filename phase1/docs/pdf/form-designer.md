# Native PDF form designer v1

Base: somnia-agent 25d09b3c5a61b07aee8cbdcda9fab727fe1878d5.
This package does not duplicate the separate comments patch series.

## Implemented

The existing native Fields panel now includes a form designer. Enter edit-copy
mode, choose Create new field, supply a unique name and select Text field,
Checkbox or Dropdown. Creation targets the currently selected page. Select an
existing supported field to change its properties, or jump to its widget page.

- Position and size in PDF user-space points, from the bottom-left. Rectangles
  must fit the page crop box, including a nonzero crop origin; minimum 8 pt.
- Text: value, multiline, optional maximum length, font size (4-100 pt).
- Checkbox: checked state, geometry, Required and Read only.
- Dropdown: 1-100 unique non-empty options, one selected value, font size.
- Required and Read only are actual AcroForm flags for all three types.
- Actual field/widget dictionaries and appearance streams, not painted imitations.
- Existing field references and page-widget relationships are retained. Stale
  property snapshots are rejected. Failed operations leave source bytes unchanged.
- Changes use the existing worker, snapshot undo/redo, dirty-state guard and
  Save copy flow. Original files are never automatically overwritten.

The designer intentionally permits changing the Read only property: it is an
explicit design tool. The separate fill UI still respects the read-only flag.

## Safety and limits

Signed, encrypted and XFA documents remain view-only. XFA is detected in the
catalog before calling pdf-lib getForm(), because that call removes XFA. Worker
fill, session fill/edit and importing another PDF enforce the same guard.

Existing multi-widget fields, rotated widgets and multi-select dropdowns are
view-only in the designer; radio/list/signature/button fields are not offered
for redesign. Existing widgets cannot be relocated between pages. No rename,
delete, drag-to-create, click placement, field actions or calculations yet.

Appearance regeneration uses Helvetica WinAnsi. Unsupported characters produce
an error instead of silently losing text. Text is limited to 20,000 characters,
field names to 100 characters (no dots/control characters), and design to 1000
fields. Existing styling is not a fidelity promise: editing regenerates text
appearances with Helvetica. Coordinate entry is functional v1, not a final
visual layout UX. Visible labels remain English. Save is a full PDF rewrite,
not an incremental append.

## Verification on October 9, 2026

- `npm run test:core`: 1679 pass, 0 fail, 18 skipped, 26 TODO; 1723 total.
- `npx tsx --test src/lib/pdfedit/*.test.ts`: 12 pass, 0 fail.
- `npm run typecheck`: pass.
- `npm run build`: pass; existing Vite chunk warnings remain.
- `node pdf-craft/spike/forms-test.mjs`: real Chrome UI and edit Worker,
  create all three types, edit dropdown options/value/required, undo/redo,
  download Save copy, parse the saved PDF, verify actual values/options/flags,
  zero page errors. Harness uses local Vite and Chrome, not a Tauri claim.
- Unit regression covers actual checked appearance state, crop origins,
  geometry, multiline/maxLength/font size, required/read-only, dictionary refs,
  stale fields, duplicate names, invalid input, unsupported encoding,
  multi-widget/multi-select/rotation/signature/XFA guards and cross-page refusal.
- Saved roundtrip passes `qpdf --check`. External PDF pixels were inspected:
  Philipp text, visible checkbox checkmark and Review dropdown appearance.
- Actual light/dark screenshots inspected: page and thumbnail render; native
  Fields designer fits the right panel; checkbox visibly checked in both themes.

The checkbox regression matters: addToPage can leave /AS Off even when /V is
checked. Checked state is reapplied after widget creation. addToPage also expands
the rectangle by half the border width, so the requested rectangle is restored.

Windows/macOS native dialogs and desktop runtime were not tested in this package.
A successful web roundtrip is not proof of a native save dialog.

## Integration

Apply the git-am series on 25d09b3. The separate comments series also touches
backend.ts and PdfPanels.tsx. Merge its comments inspection/operations/tab with
this package's designFields/xfa/form operations and Fields designer; do not
replace one side. No dependency or lockfile changes. No push or merge performed.
