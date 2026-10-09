# PDF comments package

Base: fa4863ffb4b9528285ed23b7848a39af97cc306e on `somnia-agent`.
This is not public GitHub main (which remains an older separate branch).

## Features

The existing right PDF sidebar has a Comments tab. It reads real PDF
annotations, including imported ones. Supported: Text notes, Highlight,
Underline, StrikeOut and Ink. It displays page/type/author/text, filters text,
author or type, optionally limits to the current page, and jumps to the page.
Links, widgets, popups and unsupported annotations are not shown as comments.
The list is plain React text, never rich HTML or executable PDF actions.

Edit requires the existing explicit Edit PDF copy mode. Saving comment text
writes Unicode `/Contents`, updates `/M`, removes stale `/RC` rich content,
and retains geometry, appearance stream, author and popup. Editing markup
comment text does not redraw the markup. Text is limited to 20,000 characters.

Delete requires confirmation explaining that the markup is also removed.
It removes only the exact annotation array entry and its associated popup
entries. Links/widgets and unrelated annotations remain. Object bytes may
remain as unreachable PDF objects because saving is a full rewrite, not a
secure redaction or data-erasure feature. Do not describe deleting a comment
as removing sensitive data from the file. Undo/redo uses existing snapshot
history and save copy uses existing native/browser routes.

Targets carry page, array index, object reference and dictionary snapshot.
A stale target cannot edit a replacement/look-alike annotation. ReadOnly,
Locked and LockedContents flags are enforced, including indirect flag values.
Encrypted/signed files remain view-only under the existing backend guards.
Reply comments are listed and tagged. Parent deletion is refused if any
annotation references it through `/IRT`; deleting whole threads is not yet
supported. Leaf replies can be deleted without orphaning a child thread.

Inspection is bounded to 10,000 annotations and uses a set for reply lookups.
It runs inside the existing killable edit worker, with the 20-second deadline.

## Verification

- Typecheck and production build pass. Existing bundle/import warnings remain.
  Build requires the already integrated PhotoCraft bridge; it was built from
  its pinned existing manifest, with no source changes to that bridge.
- Six comment regression tests plus existing five backend tests pass.
  Covered: imported list; Unicode update/AP/popup/link preservation; stale
  target rejection; direct/indirect flags; exact delete; popup removal;
  locked comments; replies/thread safety; reorder page targets; long contents.
- Core run before the last indirect-flag test: 1647 passed, 0 failed,
  18 skipped, 26 TODO. The final focused suite includes the new sixth test.
- Browser harness: `node pdf-craft/spike/comments-test.mjs` from `phase1`.
  Dedicated local port 1488, real worker-backed app, actual imported PDF.
  Checks read-only controls, list, edit, page jump, filter, delete, undo/redo,
  and downloads/reopens a copy. No page errors. Updated `/Contents` and removal
  of page-1 highlight are verified from saved PDF bytes.
- Actual light/dark screenshots inspected: native Comments panel fits,
  current page 2 and thumbnails render, author and edited text visible.
  Saved PDF passes `qpdf --check`.

No thread composition, author rewriting, rich text, graphical annotation
move/resize, redaction, signatures, OCR or incremental save is claimed.
English labels match the existing PDF module; localization remains future work.
No desktop runtime or Acrobat/Preview compatibility test was performed.

Upstream UI caveat: the global PDF studio strip on this base still reports
"Inline tools are not available yet", despite the working inline PDF panel.
That shared context-UI defect is not changed by this focused series.
