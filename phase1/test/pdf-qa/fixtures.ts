/**
 * Programmatic PDF fixture corpus for the PDF tools QA suite.
 *
 * Every fixture is generated at test time with pdf-lib (MIT) and fflate (MIT).
 * No binary files are committed, no third-party PDFs, no GPL/AGPL sources, no
 * Liberation or other font files (only the 14 standard fonts, referenced by name).
 *
 * Output is deterministic: fixed dates, no object streams, fixed content.
 * Fixtures that pdf-lib cannot author natively (encryption, signatures, XFA,
 * corruption) are synthesized by editing the object graph or the raw bytes.
 * Those are STRUCTURAL stand-ins; see README.md "Assumptions" A1-A3.
 */
import {
  PDFDocument, PDFName, PDFString, PDFHexString, PDFArray, PDFDict, PDFNumber, StandardFonts, rgb,
} from 'pdf-lib';
import { zlibSync } from 'fflate';

const FIXED_DATE = new Date('2026-01-02T03:04:05Z');
const SAVE = { useObjectStreams: false } as const;

async function base(title: string): Promise<PDFDocument> {
  const d = await PDFDocument.create();
  d.setTitle(title);
  d.setAuthor('Somnia QA');
  d.setProducer('somnia-qa-fixtures');
  d.setCreator('somnia-qa-fixtures');
  d.setCreationDate(FIXED_DATE);
  d.setModificationDate(FIXED_DATE);
  return d;
}

/** Marker word embedded in text fixtures so extraction tests can search for it. */
export const textMarker = (page: number, line: number) => `QA-TEXT-p${page}-l${line}`;

/** N pages (default 5) of Helvetica body text, 30 lines per page, each line starts with a marker. */
export async function textHeavy(pages = 5): Promise<Uint8Array> {
  const d = await base('Text heavy');
  const font = await d.embedFont(StandardFonts.Helvetica);
  const bold = await d.embedFont(StandardFonts.HelveticaBold);
  for (let p = 1; p <= pages; p++) {
    const page = d.addPage([612, 792]);
    page.drawText(`Chapter ${p}`, { x: 72, y: 740, size: 20, font: bold });
    for (let l = 1; l <= 30; l++) {
      page.drawText(`${textMarker(p, l)} The quick brown fox jumps over the lazy dog.`, {
        x: 72, y: 720 - l * 20, size: 11, font,
      });
    }
  }
  return d.save(SAVE);
}

/** Minimal valid truecolor PNG (no external encoder). */
export function makePng(w: number, h: number, pixel: (x: number, y: number) => [number, number, number]): Uint8Array {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const u32 = (n: number) => Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  const chunk = (type: string, data: Uint8Array) => {
    const t = new TextEncoder().encode(type);
    const td = new Uint8Array(t.length + data.length);
    td.set(t); td.set(data, t.length);
    return [u32(data.length), td, u32(crc(td))];
  };
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(w), 0); ihdr.set(u32(h), 4); ihdr[8] = 8; ihdr[9] = 2;
  const parts = [
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    ...chunk('IHDR', ihdr), ...chunk('IDAT', zlibSync(raw)), ...chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

/** `pages` pages, each with one 256x256 gradient image drawn at 400x400pt, plus a caption. */
export async function imageHeavy(pages = 4): Promise<Uint8Array> {
  const d = await base('Image heavy');
  const font = await d.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < pages; p++) {
    const png = makePng(256, 256, (x, y) => [(x + p * 40) & 255, y, (x ^ y) & 255]);
    const img = await d.embedPng(png);
    const page = d.addPage([612, 792]);
    page.drawImage(img, { x: 106, y: 250, width: 400, height: 400 });
    page.drawText(`IMG-CAPTION-${p + 1}`, { x: 72, y: 200, size: 14, font });
  }
  return d.save(SAVE);
}

export const FORM_FIELDS = {
  name: 'full_name', email: 'email', notes: 'notes', agree: 'agree', plan: 'plan',
  country: 'country', langs: 'languages', locked: 'locked_id',
} as const;

/** AcroForm with every common field kind, one read-only field, and an initial value on `locked_id`. */
export async function acroForm(): Promise<Uint8Array> {
  const d = await base('AcroForm');
  const font = await d.embedFont(StandardFonts.Helvetica);
  const page = d.addPage([612, 792]);
  const form = d.getForm();
  const label = (t: string, y: number) => page.drawText(t, { x: 50, y: y + 5, size: 10, font });
  const box = (y: number, w = 250, h = 20) => ({ x: 200, y, width: w, height: h, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  label('Full name', 700);
  form.createTextField(FORM_FIELDS.name).addToPage(page, box(700));
  label('Email', 660);
  const email = form.createTextField(FORM_FIELDS.email); email.setMaxLength(40); email.addToPage(page, box(660));
  label('Notes', 600);
  const notes = form.createTextField(FORM_FIELDS.notes); notes.enableMultiline(); notes.addToPage(page, box(580, 250, 60));
  label('I agree', 540);
  form.createCheckBox(FORM_FIELDS.agree).addToPage(page, { x: 200, y: 540, width: 16, height: 16, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  label('Plan', 500);
  const plan = form.createRadioGroup(FORM_FIELDS.plan);
  plan.addOptionToPage('free', page, { x: 200, y: 500, width: 14, height: 14, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  plan.addOptionToPage('pro', page, { x: 260, y: 500, width: 14, height: 14, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  label('Country', 460);
  const country = form.createDropdown(FORM_FIELDS.country);
  country.addOptions(['Germany', 'France', 'Spain']); country.addToPage(page, box(460));
  label('Languages', 380);
  const langs = form.createOptionList(FORM_FIELDS.langs);
  langs.addOptions(['de', 'en', 'fr', 'es']); langs.enableMultiselect(); langs.addToPage(page, box(340, 120, 60));
  label('ID (locked)', 300);
  const locked = form.createTextField(FORM_FIELDS.locked); locked.setText('A-12345'); locked.enableReadOnly();
  locked.addToPage(page, box(300));
  return d.save(SAVE);
}

/** 12 pages with mixed sizes, a rotated page, and a unique page-number label on each. Page n has label PAGE-n. */
export async function multiPage(): Promise<Uint8Array> {
  const d = await base('Multi page');
  const font = await d.embedFont(StandardFonts.Helvetica);
  const sizes: [number, number][] = [[612, 792], [595, 842], [792, 612], [200, 300]];
  for (let i = 1; i <= 12; i++) {
    const [w, h] = sizes[(i - 1) % sizes.length];
    const p = d.addPage([w, h]);
    p.drawText(`PAGE-${i}`, { x: 20, y: h - 40, size: 24, font });
    if (i === 3) p.setRotation({ type: 'degrees' as never, angle: 90 } as never);
  }
  return d.save(SAVE);
}

/** One page with a highlight and a note already in /Annots, so tests can check they survive edits. */
export async function withExistingAnnotations(): Promise<Uint8Array> {
  const d = await base('Existing annotations');
  const font = await d.embedFont(StandardFonts.Helvetica);
  const page = d.addPage([300, 400]);
  page.drawText('Annotated page', { x: 20, y: 350, size: 14, font });
  const ctx = d.context;
  const hl = ctx.register(ctx.obj({
    Type: 'Annot', Subtype: 'Highlight', Rect: [20, 345, 120, 365], QuadPoints: [20, 365, 120, 365, 20, 345, 120, 345],
    C: [1, 1, 0], Contents: PDFString.of('pre-existing highlight'), F: 4,
  }));
  const note = ctx.register(ctx.obj({
    Type: 'Annot', Subtype: 'Text', Rect: [200, 300, 220, 320], Contents: PDFString.of('pre-existing note'), F: 4,
  }));
  page.node.set(PDFName.of('Annots'), ctx.obj([hl, note]));
  return d.save(SAVE);
}


/** Raw-content helper: one page whose content stream is `content`, Helvetica as /F1. */
async function rawContentPdf(title: string, content: string, extra?: (d: PDFDocument, page: ReturnType<PDFDocument['addPage']>) => void): Promise<Uint8Array> {
  const d = await base(title);
  const font = await d.embedFont(StandardFonts.Helvetica);
  const page = d.addPage([300, 200]);
  page.node.setFontDictionary(PDFName.of('F1'), font.ref);
  page.node.set(PDFName.of('Contents'), d.context.register(d.context.flateStream(content)));
  extra?.(d, page);
  return d.save(SAVE);
}
/** Text drawn with a TJ array (kerning). The restricted text scanner must fail closed on it (arch doc section 7). */
export const tjArrayText = () => rawContentPdf('TJ array', 'BT /F1 18 Tf 20 100 Td [(Hel) -80 (lo TJ)] TJ ET');
/** Text drawn inside a Form XObject (`Do`). The restricted text scanner must fail closed on it. */
export async function formXObjectText(): Promise<Uint8Array> {
  return rawContentPdf('Form XObject text', 'q /X1 Do Q', (d, page) => {
    const font = d.context.lookup(page.node.Resources()!.lookup(PDFName.of('Font'), PDFDict).get(PDFName.of('F1')) as never);
    void font;
    const x = d.context.stream('BT /F1 18 Tf 20 100 Td (Inside XObject) Tj ET', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 300, 200],
      Resources: { Font: { F1: page.node.Resources()!.lookup(PDFName.of('Font'), PDFDict).get(PDFName.of('F1')) } },
    });
    page.node.Resources()!.set(PDFName.of('XObject'), d.context.obj({ X1: d.context.register(x) }));
  });
}
/** Plain single-Tj text that the restricted scanner CAN edit. Text is "Hello Somnia". */
export const simpleTjText = () => rawContentPdf('Simple Tj', 'BT /F1 18 Tf 20 100 Td (Hello Somnia) Tj ET');
/** Pages with CropBox offset from the MediaBox origin and each right-angle rotation. Page i: rotation i*90, CropBox [50,50,250,350] on MediaBox 300x400. */
export async function cropBoxRotations(): Promise<Uint8Array> {
  const d = await base('CropBox rotations');
  const font = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 4; i++) {
    const p = d.addPage([300, 400]);
    p.setCropBox(50, 50, 200, 300);
    p.setRotation({ type: 'degrees' as never, angle: i * 90 } as never);
    p.drawText(`CROP-${i * 90}`, { x: 60, y: 320, size: 16, font });
    p.drawRectangle({ x: 50, y: 50, width: 200, height: 300, borderWidth: 2, borderColor: rgb(1, 0, 0) });
  }
  return d.save(SAVE);
}
/** Decompression-heavy: one page whose content stream inflates to `inflatedMB` MB of comment bytes. Compressed size stays tiny. */
export async function decompressionHeavy(inflatedMB = 40): Promise<Uint8Array> {
  const d = await base('Decompression heavy');
  const page = d.addPage([200, 200]);
  const raw = new Uint8Array(inflatedMB * 1024 * 1024).fill(0x20);
  page.node.set(PDFName.of('Contents'), d.context.register(d.context.stream(zlibSync(raw, { level: 9 }), { Filter: 'FlateDecode' })));
  return d.save(SAVE);
}

/** Non-ASCII metadata and text (WinAnsi-safe vs. not) for font/encoding edge cases. */
export async function unicodeMeta(): Promise<Uint8Array> {
  const d = await base('Übergrößenträger – 日本語');
  d.setSubject('Café, naïve, Ωmega');
  const font = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([300, 200]);
  p.drawText('Grüße aus München', { x: 20, y: 150, size: 14, font }); // WinAnsi ok
  return d.save(SAVE);
}

/** Blank single page of a given size. */
export async function blank(w = 200, h = 300): Promise<Uint8Array> {
  const d = await base('Blank');
  d.addPage([w, h]);
  return d.save(SAVE);
}

/**
 * Structural "encrypted" stand-in: a valid PDF whose trailer carries a /Encrypt dictionary
 * (Standard handler, V1/R2). The page content is NOT really encrypted. Enough for
 * `PDFDocument.isEncrypted` and for the studio's view-only gate; NOT enough to test a real password
 * flow or real decryption (A1).
 */
export async function encryptedMarker(): Promise<Uint8Array> {
  const d = await base('Encrypted marker');
  d.addPage([200, 300]);
  const ctx = d.context;
  const enc = ctx.register(ctx.obj({
    Filter: 'Standard', V: 1, R: 2, P: -4,
    O: PDFHexString.of('00'.repeat(32)), U: PDFHexString.of('00'.repeat(32)),
  }));
  ctx.trailerInfo.Encrypt = enc;
  return d.save(SAVE);
}

/** Structural "signed" stand-in: an AcroForm signature field with /V /Type /Sig and a /ByteRange. Not a valid signature (A2). */
export async function signedMarker(): Promise<Uint8Array> {
  const d = await base('Signed marker');
  const page = d.addPage([300, 400]);
  const ctx = d.context;
  const sigDict = ctx.register(ctx.obj({
    Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'adbe.pkcs7.detached',
    ByteRange: [0, 0, 0, 0], Contents: PDFHexString.of('00'.repeat(16)),
  }));
  const field = ctx.register(ctx.obj({
    Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PDFString.of('Signature1'), V: sigDict,
    Rect: [20, 20, 120, 60], F: 4, P: page.ref,
  }));
  page.node.set(PDFName.of('Annots'), ctx.obj([field]));
  d.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: [field], SigFlags: 3 }));
  return d.save(SAVE);
}

/** Structural XFA stand-in: AcroForm containing an /XFA entry (A3). */
export async function xfaMarker(): Promise<Uint8Array> {
  const d = await base('XFA marker');
  d.addPage([300, 400]);
  const ctx = d.context;
  const xfaStream = ctx.flateStream('<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"/>');
  d.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: [], XFA: [PDFString.of('template'), ctx.register(xfaStream)] }));
  return d.save(SAVE);
}

/** Same text as {@link textHeavy} but with a junk prefix before %PDF- (legal up to 1024 bytes; readers accept it). */
export async function junkPrefixed(prefixBytes = 200): Promise<Uint8Array> {
  const src = await blank();
  const out = new Uint8Array(prefixBytes + src.length);
  out.fill(0x20, 0, prefixBytes - 1); out[prefixBytes - 1] = 0x0a;
  out.set(src, prefixBytes);
  return out;
}

export type CorruptKind =
  | 'truncated-half' | 'truncated-tail' | 'garbage-header' | 'empty' | 'zero-pages'
  | 'bad-startxref' | 'png-named-pdf' | 'text-file' | 'oversize-claim';

/** Build a corrupted variant. `bytes` is a valid source PDF (default: multiPage). */
export async function corrupted(kind: CorruptKind, bytes?: Uint8Array): Promise<Uint8Array> {
  const src = bytes ?? (await multiPage());
  const enc = new TextEncoder();
  switch (kind) {
    case 'truncated-half': return src.slice(0, Math.floor(src.length / 2));
    case 'truncated-tail': return src.slice(0, src.length - 64); // loses trailer/startxref/%%EOF
    case 'garbage-header': { const o = src.slice(); o.set(enc.encode('%XXX-'), 0); return o; }
    case 'empty': return new Uint8Array(0);
    case 'zero-pages': { const d = await base('Zero pages'); return d.save(SAVE); }
    case 'bad-startxref': {
      const s = new TextDecoder('latin1').decode(src);
      const i = s.lastIndexOf('startxref');
      return enc.encode(s.slice(0, i) + 'startxref\n999999999\n%%EOF\n');
    }
    case 'png-named-pdf': return makePng(4, 4, () => [255, 0, 0]);
    case 'text-file': return enc.encode('Hello, this is not a PDF.\n');
    case 'oversize-claim': { // valid PDF claiming a huge MediaBox: renderer must not allocate unbounded canvases
      const d = await base('Huge page'); d.addPage([14400, 14400]); return d.save(SAVE);
    }
  }
}

export const ALL_CORRUPT_KINDS: CorruptKind[] = [
  'truncated-half', 'truncated-tail', 'garbage-header', 'empty', 'zero-pages',
  'bad-startxref', 'png-named-pdf', 'text-file', 'oversize-claim',
];

/** Named catalogue used by the sanity test and by the E2E specs (via `writeCorpus`). */
export const CORPUS: Record<string, () => Promise<Uint8Array>> = {
  'text-heavy': () => textHeavy(),
  'text-heavy-100': () => textHeavy(100),
  'image-heavy': () => imageHeavy(),
  'acroform': acroForm,
  'multi-page': multiPage,
  'existing-annotations': withExistingAnnotations,
  'unicode-meta': unicodeMeta,
  'blank': () => blank(),
  'encrypted-marker': encryptedMarker,
  'signed-marker': signedMarker,
  'xfa-marker': xfaMarker,
  'junk-prefixed': () => junkPrefixed(),
  'tj-array-text': tjArrayText,
  'form-xobject-text': formXObjectText,
  'simple-tj-text': simpleTjText,
  'cropbox-rotations': cropBoxRotations,
  'decompression-heavy': () => decompressionHeavy(),
  ...Object.fromEntries(ALL_CORRUPT_KINDS.map((k) => [`corrupt-${k}`, () => corrupted(k)])),
};

/** Write the whole corpus to `dir` as <name>.pdf (used by Playwright specs for file choosers). */
export async function writeCorpus(dir: string): Promise<Record<string, string>> {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  mkdirSync(dir, { recursive: true });
  const out: Record<string, string> = {};
  for (const [name, make] of Object.entries(CORPUS)) {
    const p = join(dir, `${name}.pdf`);
    writeFileSync(p, await make());
    out[name] = p;
  }
  return out;
}

// Silence "unused import" for helpers kept for fixture authors.
void PDFArray; void PDFDict; void PDFNumber;
