# PDF editor architecture (skeleton)

Status: skeleton and proposal. Nothing here is implemented by this document. The four modules below are built in parallel; the central builder integrates them and may change this contract. Items marked **Open** are undecided.

## Scope

A PDF editing surface inside Somnia, built on `pdf-lib` (already a dependency). Four modules, each a pure library with no UI and no I/O:

| Module | Area | Op prefix | Responsibility |
| --- | --- | --- | --- |
| `pdftext` | text | `pdf-text-` | Extract, add, replace text |
| `pdfannotate` | annotations | `pdf-annot-` | Highlight, note, ink, remove annotations |
| `pdforganize` | pages | `pdf-page-` | Delete, reorder, rotate, extract, merge pages |
| `pdfforms` | forms | `pdf-form-` | List, fill, flatten AcroForm fields |

## Module contract

Modeled on the image editor (`OperationRegistry`, `registerFilterOps`).

- Documents are `Uint8Array` PDF bytes. Bytes are the source of truth; no module keeps a hidden parsed document between calls.
- Each module exports one function `registerPdf<Area>Ops(registry): () => void`:
  `registerPdfTextOps`, `registerPdfAnnotateOps`, `registerPdfOrganizeOps`, `registerPdfFormsOps`.
- The function registers every handler it owns, returns a disposer that removes exactly those, and is transactional: if any registration conflicts, none remain.
- Handler shape:

```ts
interface PdfOpHandler {
  readonly type: string;     // "pdf-<area>-<verb>", see naming below
  readonly version: number;  // integer >= 1
  apply(input: Uint8Array, params: Readonly<Record<string, unknown>>, context: { signal?: AbortSignal }):
    Uint8Array | Promise<Uint8Array>;
}
```

- `apply` never mutates `input`, returns a new complete PDF, and throws on invalid params (typed errors preferred; `RangeError` for bad page indices).
- Read-only queries (text extraction, field listing) are exported as plain async functions from the module, not as ops, because they return data, not a PDF. **Open:** whether queries also get a registry form.
- Long work checks `context.signal` between pages.
- Coordinates: PDF points, origin bottom-left, page indices zero-based.

## Operation naming convention

`pdf-<area>-<verb>[-<noun>]`, lowercase ASCII, hyphen separated, matching `^pdf-[a-z]+-[a-z][a-z0-9-]*$`. Areas are fixed: `text`, `annot`, `page`, `form`. The stored form is `type@version`, like `selection-cut@1`. A breaking param change bumps the version; old versions stay registered so saved documents replay.

Proposed ops (not final):

- `pdf-text-add`, `pdf-text-replace`
- `pdf-annot-highlight`, `pdf-annot-note`, `pdf-annot-ink`, `pdf-annot-remove`
- `pdf-page-delete`, `pdf-page-reorder`, `pdf-page-rotate`, `pdf-page-extract`, `pdf-page-merge`
- `pdf-form-fill`, `pdf-form-flatten`

Queries: `extractText`, `listFields` (names are proposals).

## Operation record

Serializable, so a document edit history can be saved and replayed:

```ts
interface PdfOperation { id: string; type: string; version: number; params: Record<string, unknown> }
```

Params are JSON values only. Binary inputs (for example a second PDF for merge) are passed by reference id resolved by the host, never inline. **Open:** the reference mechanism.

## Testing

Everything lives under `phase1/test/pdf/`.

- `fixtures.ts`: PDFs generated with `pdf-lib` at test time (text, multi-page, AcroForm). Standard-14 fonts only, fixed dates, deterministic bytes. No binary files are committed.
- `fixtures.test.ts`: always runs; checks the fixtures.
- `*.conformance.test.ts`: contract checks per module. They run only when `SOMNIA_PDFLIB` is set to the directory holding the four modules; otherwise they report SKIP.
- Shared checks: only `pdf-*` ops with the right area prefix, integer versions, disposer removes everything, double registration throws without leftovers, input bytes are never mutated.
- Area-specific cases are `test.todo` entries describing intended behavior.

Run:

```
cd phase1
npx tsx --test test/pdf/*.test.ts                       # fixtures run, conformance skips
SOMNIA_PDFLIB=$PWD/src/lib/pdf npx tsx --test test/pdf/*.test.ts
```

## Open items

- The module directory (`src/lib/pdf/` is assumed by the test docs) and file names are not decided; the harness accepts `<name>.ts`, `<name>.js` or `<name>/index.ts`.
- `phase1/test/pdf/` is not in the `test:core` glob in `phase1/package.json`. The integrator must add it (this change touches no existing file).
- Rendering/preview of PDFs is out of scope here (pdf-lib does not render). Choice of renderer undecided.
- Text replacement in existing PDFs is limited: content streams with subset or custom-encoded fonts cannot be edited reliably. Supported fonts and failure behavior undecided; fixtures only cover Standard-14.
- Encrypted and signed PDFs: behavior undecided. Editing breaks signatures; expected policy is to refuse or warn.
- Form flattening and appearance regeneration behavior for non-Latin text undecided.
- Performance budgets for large PDFs not set.
- The `Uint8Array`-in/out contract copies whole documents per op; incremental saves are not considered.
- Conformance specifics are skeletons. None have been run against a real module; the harness was only checked against a one-handler stub.
- UI, i18n strings, undo/redo wiring and agent tools are not specified.

## Op naming convention (decision 2026-10-07)

The delivered modules keep their names: `pdfforms.fill`, `pdfannotate.*`, `pdftext.*`, and `vector.*` for the vector scene. The `pdf-text-*` / `pdf-annot-*` / `pdf-page-*` / `pdf-form-*` names proposed in the skeleton are not used and there is no rename refactor. Future modules follow the existing scheme: `<module>.<verb>`, stored as `type@version`. The `test/pdf` conformance skeletons check the shared contract (versioned type, disposer cleans up, duplicate registration throws, input bytes never mutated) and may need their name filter adjusted when a module is wired in.
