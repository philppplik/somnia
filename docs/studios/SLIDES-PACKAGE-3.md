# Slides Studio package 3: narrow text edit and copy save

Base: package-2 d3445426502862bda1e08696f9019d3f85310061. Local patches only, no push/merge/release.

## Implemented

Editing uses original OOXML, not DeckCraft's lossy whole-deck export. In the worker, canonical presentation relationships determine actual slide order and part identity. The inspector exposes individual canonical a:t runs; replacement validates slide/part/run identity and old text. XML entities are escaped, leading/trailing spaces use xml:space=preserve without duplicate attributes, invalid XML controls/unpaired surrogates and >16 KiB UTF-8 replacement are rejected. Digitally signed packages are not editable. Noncanonical text packages keep their rendered preview without editable runs.

A copy re-ZIPs the original package, changing only the chosen slide XML. Every other uncompressed part is retained byte-for-byte. ZIP container metadata/compression are not byte-identical. This is NOT a broad OOXML fidelity claim; no PowerPoint feature parity, no arbitrary namespace parser, no semantic validation of every unsupported object. The UI says text-run editing alpha and keeps original untouched.

Working bytes remain separate from source media bytes. Text edits reimport/render the working copy. Undo/redo stores at most 10 snapshots and 64 MiB per stack. Dirty file-tab marker, slide footer and global status update. Closing/replacing a dirty deck asks to discard; browser beforeunload also watches dirty sessions. Dirty sessions are not evicted. If three dirty decks are resident, opening another through the Slides control is refused; other shared open paths may hold the resource without importing it until a slot is available.

Save a copy in browser uses a download with -edited.pptx name. Browser download initiation cannot prove the user saved the file, so dirty stays true and the UI says to check the copy; closing after download still asks to discard. Native copy save has isolated one-shot 120-second grant, OS location picker, raw-body IPC, PPTX extension and 32 MiB cap. It syncs a sibling temp then hard-links to a NEW target; existing path is never replaced, even if picked in the dialog. This includes the original path. A filesystem without hard-link support fails honestly rather than overwriting or falling back. Native successful write can clear dirty.

## Evidence

- Real Vite/TypeScript production build passed; module worker includes edit/copy operations.
- 12 focused TS tests passed, including original-part preservation, stale-run refusal, XML escaping/space preservation, multi-edit and UTF-8 cap.
- 9 production Chrome E2E passed, adding edit/undo/redo/render, copy download/reopen and cancelled/accepted dirty close to earlier routing/thumbnail lifecycle tests.
- Independent python-pptx reopened downloaded copy; all XML parts parsed with lxml; new title confirmed. ZIP entry-set is identical and only ppt/slides/slide1.xml differs, every other uncompressed part is byte-identical.
- Native core Rust: 135 passed, zero failure, including grant exact-token/one-use and refusal to overwrite an existing copy path.
- Full core excluding the known unrelated OAuth glob: 1674 passed, 18 skipped, 26 todo, zero failure.
- Actual pixels of package3-text-edit.png inspected after aria-busy=false: edited canvas title, thumbnail and inspector agree; dirty tab/footer/status and copy/undo controls fit and read correctly. Earlier screen accidentally showed pending rendering; test was corrected and decisive final image re-inspected.

Full native desktop cargo check was ATTEMPTED but blocked by missing system glib-2.0 >= 2.70 development library. Therefore the desktop command hook, native GUI/dialog/write integration and platform installer compilation are NOT signed off. Core tests do not compile desktop.rs. CI installs those platform dependencies; builder must run its native checks before shipping. No native GUI success is claimed.

Logs and downloaded edited PPTX are in validation/slides/package3 and adjacent validation/slides images.

## Additive shared hunks

- desktop.rs: SlidesGrants state, slides_save_pick/write commands, handler and manage registrations.
- build.rs/capabilities/editor.json: exact new command permissions.
- lib.rs: isolated slides_io module.
- FileTabs: dirty marker via Slides session.
- StatusBar: Slides dirty state/label subscriptions.

Preserve other studios' maps/permissions/handlers during parallel integration. Glyph mapping remains central builder's task. No other Studio implementation was edited.

## Remaining and limits

Editing is whole text run only, not rich text selection, shape transforms, tables/charts/notes or layout reflow controls. Reflow and font fidelity are not guaranteed. UI copy still English alpha. Canonical tags/relationship syntax only; preview still works for other renderer-supported decks. Native desktop compile and WebView test are blocking shipping checks. Add corpus/fuzz/XML complexity/decoded-image heap testing and structural diagnostics before calling this production-ready. Browser Save-as-copy cannot guarantee no overwrite in the browser's own download UI; the app never writes the original resource, uses a distinct suggested name and keeps dirty until checked.
