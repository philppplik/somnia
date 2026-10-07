# PDF text editing foundation

This is a headless, deliberately narrow content-stream editor, not a general PDF text editor. It uses the already installed `pdf-lib` dependency. No UI, remote service, font download, or new dependency is required.

## API

```ts
import { inspectPdfText, newPdfTextOperation, applyPdfTextOperations } from '../../phase1/src/lib/pdftext';
const runs = await inspectPdfText(sourceBytes, 0);
const op = newPdfTextOperation('edit-1', { ...runs[0], replacement: 'Hi' });
const result = await applyPdfTextOperations(sourceBytes, [op], { signal });
```

`pageIndex`, `streamIndex`, and `runIndex` are zero-based. Runs are direct `Tj` instructions in content-stream order, not a reading-order or hit-test API. Operations use the image-edit pattern: `id`, `type`, `version`, `enabled`, and JSON-only `params`. Source bytes stay outside the log. `expectedText` is an exact compare-and-swap guard. A replay starts from original bytes; later operations may target the preceding operation's replacement. No success output is returned if any operation fails. Input bytes are copied, never modified. Disabled operations still undergo schema validation. An entirely disabled log returns an untouched copy.

The edited string operand is replaced with an encoded hex string. The original font resource, size, transform, color, and text position remain. No cover rectangle is drawn. Shorter text may leave blank space; longer-than-original advances fail with `TEXT_OVERFLOW`. There is no wrapping, shrinking, centering, justification, or layout engine.

## Supported subset and font policy

- Direct, compressed or uncompressed page content streams with balanced, self-contained text/graphics state.
- One explicitly positioned `Tj` string in each `BT`/`ET` object, using `Tm`, `Td`, `TD`, or `T*` positioning. Multiple isolated text objects per stream are supported.
- Twelve Latin Standard-14 Type1 fonts: Helvetica, Times, Courier and their standard variants. No custom `Widths`, `FontDescriptor`, `ToUnicode`, embedded font, or subset font is accepted.
- Explicit WinAnsi encoding: source glyph bytes must round-trip through the standard font encoder. Replacement characters must be encodable. Accented Latin characters such as `é` work where WinAnsi supports them.
- Absent encoding or `StandardEncoding`: printable ASCII only. Extended StandardEncoding glyphs are rejected rather than guessed as WinAnsi.
- Symbol and ZapfDingbats are Standard-14 fonts but are intentionally rejected because their mappings are not Latin text.
- Default character/word spacing, horizontal scaling, rise and fill rendering only. Finite line leading is retained, but only one show per object is permitted.

There is **no silent font fallback**. Replacing a subset font with Helvetica can destroy glyph identity and layout. Unsupported text, fonts, encodings or operators produce a `PdfTextError` with a stable code. The caller can offer a different workflow, not pretend the text was edited.

## Errors

`INVALID_OPERATION`, `INVALID_PDF`, `UNSUPPORTED_CONTENT`, `UNSUPPORTED_FONT`, `UNENCODABLE_TEXT`, `TARGET_NOT_FOUND`, `STALE_TARGET`, `TEXT_OVERFLOW`. Cancellation raises `AbortError`. Malformed low-level PDF structures may also raise a pdf-lib parse/type error; callers must handle general failures too.

## Safety and limitations

This is **not redaction or sanitization**. Old indirect streams can remain unreferenced in the saved PDF object table. Original text may also occur in metadata, annotations, attachments, accessibility text, other pages or form objects. Do not use this API to remove confidential information. Saving may invalidate digital signatures and does not preserve the original byte-level document structure.

The whole selected page's streams are checked before editing. A `TJ` array, form `Do`, inline image, marked content, external graphics state, non-default text settings or unsupported font on that page blocks the operation. This avoids silently missing text in an XObject or assuming inherited state across streams. Balanced `q`/`Q` wrappers within a stream are supported; wrappers split across streams are not. Operators and bytes outside the replaced operand are retained, but pdf-lib reserializes the document.

## Open work

- General extraction and coordinate hit testing; no bounding rectangles are provided yet.
- `TJ` arrays, kerning, multiple dependent text shows, reflow and wider replacement layout.
- Embedded/subset/Type0 fonts, Unicode shaping, RTL and font licensing/fallback decisions.
- Images/scans and OCR; form XObjects, annotations and form field editing.
- Sanitized redaction with unreachable-object removal and a document-wide leak audit.
- Real-world PDF corpus testing, large-input limits, worker execution and finer cancellation checkpoints. Current tests cover synthetic simple documents, not arbitrary office exports.
- UI integration, operation persistence and undo/redo integration belong to the central builder.

## Validation

`npm run test:core` discovers `src/lib/pdftext.test.ts`, which imports the node:test cases in `pdftext/`. For a focused run: `npx tsx --test src/lib/pdftext/*.test.ts`. Tests cover JSON replay, actual replacement, all twelve Latin fonts, WinAnsi accents, empty/shorter/chained edits, stale targets, overflow, malformed logs/PDFs, unsupported operators/fonts/encodings, literal escaping, multipage preservation, atomic failures and cancellation.
