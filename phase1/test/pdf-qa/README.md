# PDF tools QA foundation

New test files only. Nothing here changes product code, `package.json` or CI.

Base checkout: `1d014e1` (beta.4). Licenses: all fixtures are generated at test time with pdf-lib (MIT) and fflate (MIT). No committed binaries, no third-party PDFs, no font files, no GPL/AGPL code. Fixtures reference the 14 standard fonts by name only (a test enforces "no /FontFile").

## Files

| File | Purpose |
| --- | --- |
| `test/pdf-qa/fixtures.ts` | Corpus generator (`CORPUS`, `writeCorpus(dir)`, individual builders) |
| `test/pdf-qa/fixtures.test.ts` | Checks the corpus: builds, deterministic, size classes, no embedded fonts |
| `test/pdf-qa/markup-golden.test.ts` | Golden tests: what the markup studio does today. `OBSERVED-QUIRK` marks questionable behavior that is pinned, not endorsed |
| `tests/pdf-tools.spec.ts` | Playwright: 7 LIVE tests (pass on baseline), 27 `test.fixme` SPEC tests for import/edit/export |

## Run

```
npx tsx --test test/pdf-qa/*.test.ts          # 79 tests, ~7 s
npx playwright test tests/pdf-tools.spec.ts    # LIVE pass, SPEC skipped
```
`npm run test:core` does not include `test/pdf-qa/` (the glob list is fixed in package.json). Add `test/pdf-qa/*.test.ts` to it when the owner agrees. `npm run dev` needs the WASM bridges built (`craft:build` etc.); without them use `pw.local.config.ts` (plain vite).

## Corpus

text-heavy (5 and 100 pages, markers `QA-TEXT-p<n>-l<k>`), image-heavy (4 pages, 256x256 PNG each, ~750 KB), acroform (8 fields: 4 text incl. maxLength and a read-only one, checkbox, radio, dropdown, option list), multi-page (12 pages, 4 sizes, page 3 rotated 90), existing-annotations, unicode-meta, blank, cropbox-rotations (CropBox offset x 4 rotations), simple-tj-text, tj-array-text, form-xobject-text, decompression-heavy (40 MB inflated, tiny on disk), junk-prefixed, encrypted-marker, signed-marker, xfa-marker, and corrupt-* (truncated-half, truncated-tail, garbage-header, empty, zero-pages, bad-startxref, png-named-pdf, text-file, oversize-claim).

## Observed baseline behavior worth a product decision

1. pdf-lib silently recovers truncated files: a half-truncated 12-page file inspects as 6 pages with no error. Saving over the original would drop pages.
2. pdf.js and pdf-lib disagree on damaged files: pdf.js refuses truncated files that pdf-lib edits.
3. A zero-page PDF loads as one blank page.
4. `inspectPdf` page size is the MediaBox, not the CropBox. Annotation validation does use the CropBox.
5. `applyPdfEdit` rejects `ink` (allow-list) although `exportAnnotatedPdf` can write it.
6. Added text: no font fallback. CJK throws a raw pdf-lib error. Off-page coordinates are accepted.
7. Form widget pages cannot be deleted; sources with form fields cannot be merged (kept per the architecture doc).

## Assumptions (every one)

- A1 `encrypted-marker` is structural only: an /Encrypt dict in the trailer on an unencrypted file. It triggers `isEncrypted` and the view-only gate. It cannot test password entry or real decryption. pdf-lib cannot create encrypted PDFs and no encrypting tool is allowed here.
- A2 `signed-marker` has a Sig field with a /ByteRange and no real signature. It tests the "signature present" gate only.
- A3 `xfa-marker` has an /XFA entry with a stub stream. Not a real XFA form.
- A4 No embedded, subset or CJK font fixture exists, because making one needs a font file and licensing review. The architecture doc asks for these; they remain a gap.
- A5 Golden tests pin the current error message text with regexes. A reworded message will fail them on purpose.
- A6 `corrupt-oversize-claim` is a valid 14400 x 14400 pt page, not a malformed file.
- A7 The decompression test uses 40 MB inflated and a 15 s ceiling (watchdog is 20 s). It is not a real zip bomb.
- A8 The golden test shims `Promise.try` for Node < 24 like the existing pdfview test does.
- A9 The pdf.js load tests run in Node without canvas: page count, size and text only, no rendering. Pixel checks are not covered (arch doc section 7 requires them; needs a visual pass in Windows WebView2/macOS).
- A10 SPEC specs call commands as `executeCommand('pdf.<module>.<verb>', args)`. These ids are guesses that follow `<module>.<verb>`. The real ids are unknown.
- A11 Export in the web build is a browser download. The Tauri native dialog path is not covered.
- A12-A25 Proposed `data-testid`s and behaviors, each tagged in `tests/pdf-tools.spec.ts`: capability reason (`pdf-capability-reason`), tool buttons (`pdf-tool-*`), search (`pdf-search-input`, `pdf-search-count`), dirty flag (`pdf-dirty`), form inputs (`pdf-field-<name>`), export buttons (`pdf-export-*`), pixel budget for huge pages, "-edited" style export filename, caller-ordered page extraction, preset ids `original-quality` and `small`. A17: exported text is checked weakly; replace with a pdf.js reopen-and-search once the viewer API is exposed to tests. A21: the rotation/CropBox click-placement test is a TODO with the required pixel assertion described.
- A26 Expected product rules in SPEC tests come from the PDF architecture doc as relayed by the lead (view-only for signed/encrypted/XFA on every edit path; no silent flatten; copy export never overwrites; no OCR claims). If the doc changes, these change.
- A27 Playwright LIVE tests rely on the dev fixture project and on existing selectors (`media-name`, `pdf-page-count`, `pdf-error`, `pdf-stage`, `Page number`, `Previous/Next page`). The pass was observed on a plain vite server, 7 of 7.
- A28 Not run here: the 27 SPEC tests (skipped by design), the Tauri build, Windows/macOS.
