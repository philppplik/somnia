import {
  PDFDocument, StandardFonts, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList, PDFButton, PDFSignature,
  type PDFField,
} from 'pdf-lib';
import type { PdfFieldInfo, PdfFieldKind, PdfFieldError, PdfFieldValue, PdfFillOptions, PdfFillResult } from './types';

function kindOf(f: PDFField): PdfFieldKind {
  if (f instanceof PDFTextField) return 'text';
  if (f instanceof PDFCheckBox) return 'checkbox';
  if (f instanceof PDFRadioGroup) return 'radio';
  if (f instanceof PDFDropdown) return 'dropdown';
  if (f instanceof PDFOptionList) return 'optionlist';
  if (f instanceof PDFButton) return 'button';
  if (f instanceof PDFSignature) return 'signature';
  return 'unknown';
}

function describe(f: PDFField): PdfFieldInfo {
  const kind = kindOf(f);
  const base = { name: f.getName(), kind, readOnly: f.isReadOnly(), required: f.isRequired() };
  if (f instanceof PDFTextField) {
    const max = f.getMaxLength();
    return { ...base, value: f.getText() ?? '', multiline: f.isMultiline(), ...(max !== undefined ? { maxLength: max } : {}) };
  }
  if (f instanceof PDFCheckBox) return { ...base, value: f.isChecked() };
  if (f instanceof PDFRadioGroup) return { ...base, value: f.getSelected() ?? null, options: f.getOptions() };
  if (f instanceof PDFDropdown) return { ...base, value: f.getSelected(), options: f.getOptions(), editable: f.isEditable() };
  if (f instanceof PDFOptionList) return { ...base, value: f.getSelected(), options: f.getOptions(), multiSelect: f.isMultiselect() };
  return { ...base, value: null };
}

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
}

/** Read all AcroForm fields. Returns [] for PDFs without a form. Never mutates input. */
export async function readFormFields(bytes: Uint8Array): Promise<PdfFieldInfo[]> {
  const doc = await load(bytes);
  return doc.getForm().getFields().map(describe);
}

export async function hasForm(bytes: Uint8Array): Promise<boolean> {
  return (await readFormFields(bytes)).length > 0;
}

const err = (field: string, code: PdfFieldError['code'], message: string): PdfFieldError => ({ field, code, message });

type Encoder = { encodeText(t: string): unknown };

function setValue(f: PDFField, v: PdfFieldValue, opts: PdfFillOptions, font: Encoder): PdfFieldError | null {
  const name = f.getName();
  const texts = typeof v === 'string' ? [v] : Array.isArray(v) ? v : [];
  for (const t of texts) {
    try { font.encodeText(t); } catch { return err(name, 'encoding', 'Text has characters the built-in Helvetica font cannot draw (WinAnsi only)'); }
  }
  if (f instanceof PDFTextField) {
    if (v !== null && typeof v !== 'string') return err(name, 'type-mismatch', 'Text field needs a string or null');
    if (v === null || v === '') { f.setText(undefined); return null; }
    const max = f.getMaxLength();
    if (max !== undefined && [...v].length > max) return err(name, 'max-length', `Value exceeds max length ${max}`);
    f.setText(v);
    return null;
  }
  if (f instanceof PDFCheckBox) {
    if (typeof v !== 'boolean') return err(name, 'type-mismatch', 'Checkbox needs true or false');
    if (v) f.check(); else f.uncheck();
    return null;
  }
  if (f instanceof PDFRadioGroup) {
    if (v === null) { f.clear(); return null; }
    if (typeof v !== 'string') return err(name, 'type-mismatch', 'Radio group needs an option string or null');
    if (!f.getOptions().includes(v)) return err(name, 'invalid-option', `"${v}" is not one of: ${f.getOptions().join(', ')}`);
    f.select(v);
    return null;
  }
  if (f instanceof PDFDropdown || f instanceof PDFOptionList) {
    if (v === null) { f.clear(); return null; }
    const list = typeof v === 'string' ? [v] : Array.isArray(v) ? [...v] : null;
    if (!list || list.some((x) => typeof x !== 'string')) return err(name, 'type-mismatch', 'Needs a string, string[] or null');
    if (list.length > 1 && (f instanceof PDFDropdown || !f.isMultiselect())) return err(name, 'type-mismatch', 'Field allows a single selection');
    const known = f.getOptions();
    const missing = list.filter((x) => !known.includes(x));
    if (missing.length) {
      const canAdd = opts.addMissingOptions || (f instanceof PDFDropdown && f.isEditable());
      if (!canAdd) return err(name, 'invalid-option', `Not in options: ${missing.join(', ')}`);
      f.addOptions(missing);
    }
    f.select(list.length === 1 ? list[0] : list);
    return null;
  }
  return err(name, 'unsupported', `Fields of kind "${kindOf(f)}" cannot be filled`);
}

/**
 * Set values by field name and optionally flatten. Pure: input bytes untouched.
 * Per-field problems are collected in `errors`; other fields are still applied.
 * Missing/invalid fields never abort the whole fill.
 */
export async function fillForm(
  bytes: Uint8Array,
  values: Readonly<Record<string, PdfFieldValue>>,
  opts: PdfFillOptions = {},
): Promise<PdfFillResult> {
  const doc = await load(bytes);
  const form = doc.getForm();
  const byName = new Map(form.getFields().map((f) => [f.getName(), f] as const));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const applied: string[] = [];
  const errors: PdfFieldError[] = [];
  for (const [name, value] of Object.entries(values)) {
    const f = byName.get(name);
    if (!f) { errors.push(err(name, 'not-found', 'No such field')); continue; }
    if (f.isReadOnly() && !opts.overrideReadOnly) { errors.push(err(name, 'read-only', 'Field is read-only')); continue; }
    try {
      const e = setValue(f, value, opts, font);
      if (e) errors.push(e); else applied.push(name);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(err(name, /WinAnsi|encode/i.test(msg) ? 'encoding' : 'error', msg));
    }
  }
  let flattened = false;
  if (opts.flatten) {
    try {
      form.updateFieldAppearances();
      form.flatten();
      flattened = true;
    } catch (e) {
      errors.push(err('*', 'error', `Flatten failed: ${e instanceof Error ? e.message : String(e)}`));
    }
  }
  return { bytes: await doc.save(), applied, errors, flattened };
}

/** Flatten only (no value changes). */
export async function flattenForm(bytes: Uint8Array): Promise<Uint8Array> {
  const r = await fillForm(bytes, {}, { flatten: true });
  if (!r.flattened) throw new Error(r.errors[0]?.message ?? 'Flatten failed');
  return r.bytes;
}
