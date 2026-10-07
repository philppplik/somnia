# pdfannotate

Headless PDF annotation core (no UI). Annotations are stored as JSON ops (same envelope as the image editor ops: `id`, `type`, `version`, `enabled`, `params`) and exported as real PDF annotation objects with `pdf-lib`.

## Coordinates
PDF user space: points, origin bottom-left, per 0-based page index. The UI layer must convert from screen coordinates. Rects with negative width/height are flipped on normalize.

## Kinds
| kind | PDF subtype | data |
|---|---|---|
| `highlight` | Highlight | `rects[]` (one per text line), opacity default 0.4, Multiply blend in the appearance stream |
| `underline` | Underline | `rects[]` |
| `strikeout` | StrikeOut | `rects[]` |
| `note` | Text (`/Name /Note`) | `position` (top-left of 20x20 icon), `contents` |
| `ink` | Ink | `strokes[][]` of points, `width` |

Common fields: `page`, `color` (RGB 0..1), `opacity`, `contents` (Unicode, written as hex string), `author` (`/T`).

## API
- `addAnnotationOp(id, annotation)`, `updateAnnotationOp(id, targetId, patch)`, `removeAnnotationOp(id, targetId)`
- `resolveAnnotations(ops)` replays ops in order (disabled ops skipped; unknown targets ignored; duplicate add ids throw).
- `serializeAnnotOps(ops)` / `parseAnnotOps(text)` - schema `somnia.pdfannotate/1`, fully validated on parse.
- `exportAnnotatedPdf(pdfBytes, opsOrResolved)` -> `{ bytes, written, skipped[] }`. Works on a copy, keeps existing annotations, appends to `/Annots`, sets `/NM` to the annotation id. Annotations for missing pages are skipped and reported.
- `listPdfAnnotations(pdfBytes)` - read back subtype/contents/id per page.

Highlight/underline/strikeout/ink get a generated appearance stream so every viewer renders them identically. Notes rely on the viewer's standard icon.

## Tests
`npx tsx --test src/lib/pdfannotate/*.test.ts` (7 tests, node:test). Not yet part of the `test:core` glob; the integrator should add `src/lib/pdfannotate/*.test.ts`.

## Open / not done
- No import of existing PDF annotations into ops (only `listPdfAnnotations` for read-back). Existing ones are preserved untouched.
- Page `/Rotate` and non-zero CropBox origins are not compensated; coordinates are raw user space.
- No text-to-rect extraction (the UI must supply line rects, e.g. from unpdf positions).
- Not verified in Acrobat/Preview/Edge; only structure checked by tests (pdf-lib read-back). Visual render check is still open.
- Note has no custom appearance; icon look is viewer-dependent.
- Editing/deleting an existing annotation in a file is not supported, only ops added in this session.
- No UI, no i18n strings, no extension API surface.
