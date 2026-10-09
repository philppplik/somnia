# Native PDF comment replies

Base: somnia-agent 769ad33, including annotation creation. No push/merge.

## Implemented

The native Comments panel now offers Reply to comment for supported unlocked
indirect original comments. Replies are real /Text annotations with /IRT pointing
to the exact original annotation ref, /RT /R, /P, unique /NM, timestamp, Unicode
/Contents and /AP /N. Author is deliberately empty, not guessed. Reply annotations
use the Hidden flag so they appear in review threads rather than painting duplicate
note icons over the original. The original annotation and markup stay unchanged.

Threads show root followed by indented replies. Filtering retains the whole thread
when any member matches; the count reports actual matching comments. Current-page
filter remains available. Replies can be edited and individually deleted with the
existing confirmation and undo/redo flow. A parent with replies cannot be deleted.
Cancel reply keeps the PDF unchanged; empty/overlong replies are refused.

Save copy writes the thread refs into the actual PDF. The browser test downloads,
parses and then reopens the saved file in the native viewer, where the thread still
shows its root and replies. This is not an internal-only comment database.

## Guards and limits

Replying uses the same exact page/Annots slot/ref/dictionary snapshot checks as
editing. Stale or wrong targets, locked/read-only parents, signatures, encrypted
and XFA files are refused. Direct-dictionary comments can still use their existing
edit/delete behavior but cannot receive a reply: an indirect parent ref is required.
Only original comments receive replies; nested new replies are intentionally not
created. Imported nested/cyclic/missing-parent/group replies remain visible with
an ungrouped warning instead of being discarded or assigned to a look-alike parent.
Legacy imported replies with missing RT are grouped as replies; RT Group is not.

Maximum reply text is 20,000 characters and at least one non-space character.
Total annotation inspection/creation remains bounded at 10,000. Crop must fit a
20pt reply icon rectangle, although the hidden reply icon is not drawn on-page.

No whole-thread deletion, resolve/status model, author assignment, nested reply
creation or geometry/color editing of imported markup in this package. Existing
single-comment text editing/deletion and appearance-preservation behavior remains.
No PDF actions/scripts execute. Full-rewrite saves and no automatic overwrite as
before. Labels are English; desktop Windows/macOS dialogs were not tested.

## Verification on October 9, 2026

- Core: 1709 pass, 0 fail, 18 skipped, 26 TODO; 1753 total.
- Focused pdfedit suite: 28 pass, 0 fail.
- Typecheck and standard npm run build pass. After the sandbox reset, installed
  Rust 1.95.0 / wasm-bindgen-cli 0.2.129 and rebuilt craft and raster-codec assets;
  no fake runtime placeholders or build bypass. Existing Vite warnings remain.
- Real Chrome/Worker harness `node pdf-craft/spike/replies-test.mjs` creates two
  replies to an imported parent, edits Unicode content, tests empty/cancel and
  deletion confirmation cancel/accept, parent protection, filter grouping,
  undo/redo, download, PDF IRT/RT/P/AP/Hidden/Contents readback and native reopen.
  No pageerrors. Existing imported-comments UI regression also passes.
- Unit regressions cover reply refs/AP/Unicode, parent deletion protection,
  nested refusal, leaf edit/delete, invalid/stale/locked/direct targets,
  signatures/XFA and grouping of malformed imported graphs without loss.
- Saved PDF passes qpdf --check.
- Actual light/dark screenshots directly inspected: visible original note,
  native root plus two indented replies, disabled parent delete, readable content.
  External PDF rendered and inspected: original yellow note remains; hidden
  replies add no duplicate page icons. Thread semantics verified by object readback
  and native reopen rather than inferred from page pixels.

## Integration

Three commits: backend/reply graph and unit tests, native thread UI, browser
roundtrip and docs. Shared points: comments.ts/backend.ts/PdfCommentsPanel.tsx;
pdfannotate/export.ts exposes the existing annotation builder for reply AP reuse.
No dependency/lockfile changes. Generated untracked runtime assets are not part
of the git-am series and were handed off separately as a ZIP.
