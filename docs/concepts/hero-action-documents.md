# Documents Studio hero action: Export

Status: design proposal, not implemented. Philipp reviews this before development.
Research checked: 2026-10-13. Repository baseline: `int/shell` at `e2a188d3`.

## Recommendation

Use **Export** beside Account. It opens a small document-specific export popup,
not Publish, Share or a server setup wizard. The honest first version offers
**Word document (.docx), save a copy** using the current engine. PDF is the desired
next format, but it must not appear as working until a real export path is verified.

## Product evidence and alternatives

- Word for the web exposes File > Export > PDF, including a separate PDF-with-comments
  option and a download confirmation [1]. This is evidence for a document delivery
  workflow, **not** evidence that Word has a top-right Export hero.
- Adobe's Google Docs guide describes File > Download > PDF [2]. That reinforces
  local file delivery as a familiar alternative to sharing a cloud document.
- **Export** is useful for Somnia's local-first model and is more general than
  "PDF" while the current implementation only emits DOCX copies.
- **Share** would imply a collaboration/link model this studio does not establish.
  **Review** is plausible later but a risk-inspection panel is not a complete
  document review workflow. **Save** is already a global file operation.

Promoting a menu workflow into this hero slot is Somnia's proposed design choice,
not a claim of universal competitor top-bar placement.

## UX and states

1. Click Export to open a focused popup, preselected to Word document (.docx).
   Show filename, copy semantics and applicable fidelity warnings.
2. Only available formats appear. No disabled "coming soon" PDF option.
   Saving a copy never overwrites the opened document and never clears its dirty
   state as though the original were saved.
3. If the engine reports unsupported-content risks, retain the existing warning
   and explicit Save anyway confirmation. Export does not bypass it.
4. Export the current engine content, including edited text. Flush or explicitly
   settle any pending paragraph edit before producing bytes. Cancel leaves the
   document and caret unchanged; failure keeps all work and shows an error.
5. Current save helper downloads a new DOCX copy, including on the current frontend
   path. Do not describe this as a verified native Save As dialog or original-file
   save. Name the action "Save a copy" until native destination handling exists.
6. No document or engine not ready: disabled Export, with an accessible reason.
   Loading/saving: busy state, no repeat submission. Read-only input may still be
   exported if the engine supports it; it must not be edited or overwritten.
7. A later PDF format needs page-range policy, fonts/layout fidelity, supported
   content handling and accessibility checks. Do not turn rendered page images
   into an unlabelled, inaccessible "editable PDF" shortcut.

## Existing commands and gaps

| Item | Current fact | Proposed reuse |
| --- | --- | --- |
| `documents.saveCopy` | Manifest declaration only; no runtime command registration found | Register a real UI command wrapping the current save + loss-warning flow |
| `saveCopy(engine, name)` | Actual DOCX download helper | Reuse bytes, MIME and copy naming, not a second serializer |
| `documents.zoom*`, `documents.pages.goto` | Real navigation commands | Unchanged; do not call export "Presentation mode" |
| `deploy.open` | Existing Publish dialog command | Keep in Project/palette under current availability rules |

Grounding: `phase1/src/lib/studios/documents.ts`, `lib/documents/commands.ts`,
`lib/documents/saveCopy.ts`, and `components/documents/DocumentsCanvas.tsx`.
The actual Save copy button currently calls local handlers directly. A proposed
`documents.export.open` UI command should own opening the popup; it is **new**, not
an existing command. Its DOCX choice dispatches the newly completed
`documents.saveCopy` command. Both must retain the same warning gate. PDF requires
separate engine/backend research; no reusable Documents PDF-export command was
found in the inspected paths.

## Shell boundary and Publish

The generic shell owns one stable slot beside Account, never a Documents branch.
A future optional manifest descriptor names `documents.export.open`, localized
Export and an icon. The shared shell currently has **no hero-action property**;
coordinate an additive descriptor with its owner, leaving the current panel,
menu, rail and StudioContext contracts intact. The Documents controller owns
popup content, readiness and save behavior. Shared busy state must not read engine
internals. Remove or relocate the canvas's duplicate Save copy button once the hero
and Project > Export route cover it; no second export implementation.

Publish remains Project > Publish (`deploy.open`), command palette and the existing
shortcut on desktop. It publishes the configured web project, not this DOCX.
Keep that scope clear in its dialog; this concept does not add document hosting.
Use generic compact/overflow behavior with a named keyboard-accessible action.
Preserve active-deployment progress visibility outside the removed header button.

## Effort and acceptance

Planning estimate after the shared slot exists: 1-2 days for popup, command
registration, warning reuse and tests. PDF is a separate discovery/implementation
item; no reliable duration is assigned without engine proof. Shared slot effort
is not included. No app code changes in this proposal.

Acceptance: dirty text appears in exported bytes; original never overwritten;
loss warning cannot be bypassed from any entry point; cancellation and download
failure; busy/repeated click; no document; no fake PDF capability; five locales;
Publish reachability; keyboard/focus return; light/dark and compact screenshots.
No implementation or visual validation is claimed by this concept.

## Sources

[1] Microsoft Support, "Export Word document as PDF", official instructions,
no date shown: https://support.microsoft.com/en-us/word/export-word-document-as-pdf

[2] Adobe Acrobat, "How to Convert a Google Doc to a PDF", vendor tutorial,
no date shown: https://www.adobe.com/uk/acrobat/resources/google-doc-to-pdf.html

Roadmap-Delta: add review-gated Documents Export with real DOCX command wiring;
track verified PDF export separately, without exposing unfinished formats.
