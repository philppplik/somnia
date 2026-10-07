# PDF form filling (`phase1/src/lib/pdfforms`)

Headless core, no UI. Uses `pdf-lib` (existing dependency). All functions are pure: input bytes are never mutated.

## API

- `readFormFields(bytes)` -> `PdfFieldInfo[]` (name, kind, value, options, readOnly, required, multiline, maxLength, editable, multiSelect). Kinds: text, checkbox, radio, dropdown, optionlist, button, signature, unknown. Buttons and signatures are listed but cannot be filled.
- `hasForm(bytes)`
- `fillForm(bytes, values, { flatten?, overrideReadOnly?, addMissingOptions? })` -> `{ bytes, applied, errors, flattened }`
- `flattenForm(bytes)`
- Operations (same shape as `imageedit` ops, plain JSON): `newFillOperation`, `patchFillOperation`, `setFlatten`, `parseFillOperation` (validates untrusted JSON), `applyFillOperations(bytes, ops)`. Op type `pdfforms.fill`, version 1.

## Value types

| Field | Value |
|---|---|
| text | `string`, `null` or `''` clears |
| checkbox | `boolean` |
| radio | option name, `null` clears |
| dropdown | option name (single string); `null` clears |
| optionlist | `string` or `string[]` (multi only if multiselect); `null` clears |

## Error handling

Problems are reported per field in `errors` (`not-found`, `read-only`, `type-mismatch`, `invalid-option`, `max-length`, `encoding`, `unsupported`, `error`). Other fields are still applied. Only a corrupt/encrypted PDF makes `readFormFields`/`fillForm` throw (from `PDFDocument.load`).

## Limits

- Text drawn with built-in Helvetica (WinAnsi). Other characters are rejected with `encoding`; no custom font embedding yet.
- Flatten uses pdf-lib's flatten; it removes the form for all fields, no per-field flatten.
- XFA forms are not supported (AcroForm only). Encrypted PDFs are not opened.
- Existing appearance streams of fields you did not touch are kept unless you flatten.
