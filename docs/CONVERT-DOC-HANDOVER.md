# Document conversion handover

Branch: feature/convert-doc. Base: somnia-agent 535d236.

Two commits in the bundle: research layer (cherry-pick of research commit 5fd9e9d) and document facade/browser hardening. Import `convertDocument` lazily from `src/lib/conversion/documents` for the four documented pairs; show warnings with the result. Existing research helpers remain in `src/lib/convert/docConvert` (Markdown -> DOCX, DOCX -> text, images -> PDF). Heavy imports are now lazy inside those helpers too.

If the research commit was already integrated, cherry-pick only the second commit, resolving the docConvert files and package manifest against that research layer. Otherwise apply both bundled commits. No push, PR, CI, paid API, or OS installer build was run.

`npm run test:documents` runs both test directories. `npm run test:core` now includes both. Run `npm install` after applying. License registry regenerated; pdfmake/Roboto license files included. Read `docs/research/doc-conversion.md` for fidelity/security caveats and validation evidence.

Integration still needed: common conversion dialog, local byte reader/save-copy writer, displaying warnings/errors and cancel state. Never overwrite the source as an implicit conversion action. Native Tauri smoke tests are not performed here.
