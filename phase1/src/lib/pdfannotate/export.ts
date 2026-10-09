import {
  PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString, type PDFContext,
} from 'pdf-lib';
import { PdfAnnotError, rectToQuadPoints, resolveAnnotations, normalizeAnnotation } from './model';
import type { PdfAnnotOp, PdfAnnotation, Rect, ResolvedAnnotation } from './types';

const n = (v: number) => (Math.round(v * 1000) / 1000).toString();
const col = (c: readonly number[]) => c.map(n).join(' ');

function bounds(a: PdfAnnotation): Rect {
  if (a.kind === 'note') return { x: a.position.x, y: a.position.y - 20, width: 20, height: 20 };
  if (a.kind === 'ink') {
    const pts = a.strokes.flat();
    const pad = a.width / 2;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
    return { x, y, width: Math.max(...xs) + pad - x, height: Math.max(...ys) + pad - y };
  }
  const x = Math.min(...a.rects.map((r) => r.x)), y = Math.min(...a.rects.map((r) => r.y));
  const x2 = Math.max(...a.rects.map((r) => r.x + r.width)), y2 = Math.max(...a.rects.map((r) => r.y + r.height));
  return { x, y, width: x2 - x, height: y2 - y };
}

/** Appearance stream content in page space (BBox = Rect), so viewers render it without regenerating. */
function appearance(a: PdfAnnotation): string | null {
  const c = col(a.color);
  switch (a.kind) {
    case 'highlight':
      return `/GS gs ${c} rg\n` + a.rects.map((r) => `${n(r.x)} ${n(r.y)} ${n(r.width)} ${n(r.height)} re f`).join('\n');
    case 'underline':
      return `/GS gs ${c} RG 1 w\n` + a.rects.map((r) => `${n(r.x)} ${n(r.y + 1)} m ${n(r.x + r.width)} ${n(r.y + 1)} l S`).join('\n');
    case 'strikeout':
      return `/GS gs ${c} RG 1 w\n` + a.rects.map((r) => `${n(r.x)} ${n(r.y + r.height / 2)} m ${n(r.x + r.width)} ${n(r.y + r.height / 2)} l S`).join('\n');
    case 'ink':
      return `/GS gs ${c} RG ${n(a.width)} w 1 J 1 j\n` +
        a.strokes.map((s) => s.map((p, i) => `${n(p.x)} ${n(p.y)} ${i === 0 ? 'm' : 'l'}`).join(' ') + ' S').join('\n');
    case 'note': {
      const x=a.position.x,y=a.position.y-20;
      return `/GS gs ${c} rg 0.25 0.2 0.1 RG 1 w\n` +
        `${n(x+1)} ${n(y+1)} 18 18 re B\n` +
        [6,10,14].map(d=>`${n(x+4)} ${n(y+d)} m ${n(x+16)} ${n(y+d)} l S`).join('\n');
    }
  }
}

const SUBTYPE = { highlight: 'Highlight', underline: 'Underline', strikeout: 'StrikeOut', note: 'Text', ink: 'Ink' } as const;

function buildAnnotation(ctx: PDFContext, a: PdfAnnotation, id: string, pageRef: PDFRef): PDFRef {
  const b = bounds(a);
  const rect = [b.x, b.y, b.x + b.width, b.y + b.height];
  const dict: Record<string, unknown> = {
    Type: 'Annot',
    P: pageRef,
    Subtype: SUBTYPE[a.kind],
    Rect: rect,
    F: 4, // Print
    C: [...a.color],
    CA: a.opacity,
    NM: PDFString.of(id),
    Contents: PDFHexString.fromText(a.contents),
    M: PDFString.fromDate(new Date()),
  };
  if (a.author) dict.T = PDFHexString.fromText(a.author);
  if (a.kind === 'highlight' || a.kind === 'underline' || a.kind === 'strikeout') {
    dict.QuadPoints = a.rects.flatMap(rectToQuadPoints);
  } else if (a.kind === 'note') {
    dict.Name = 'Note';
    dict.Open = false;
  } else if (a.kind === 'ink') {
    dict.InkList = a.strokes.map((s) => s.flatMap((p) => [p.x, p.y]));
    dict.BS = { Type: 'Border', W: a.width, S: 'S' };
  }
  const content = appearance(a);
  if (content) {
    const gs = ctx.obj({ Type: 'ExtGState', CA: a.opacity, ca: a.opacity, ...(a.kind === 'highlight' ? { BM: 'Multiply' } : {}) });
    const ap = ctx.stream(content, {
      Type: 'XObject', Subtype: 'Form', BBox: rect,
      Resources: ctx.obj({ ExtGState: ctx.obj({ GS: gs }) }),
    });
    dict.AP = { N: ctx.register(ap) };
  }
  return ctx.register(ctx.obj(dict as Parameters<PDFContext['obj']>[0]));
}


export interface ExportResult { bytes: Uint8Array; written: number; skipped: { id: string; reason: string }[] }

/**
 * Write annotations as real PDF annotation objects (/Annots) into a copy of `pdf`.
 * Existing annotations are kept. Annotations whose page does not exist are skipped and reported.
 */
export async function exportAnnotatedPdf(
  pdf: Uint8Array | ArrayBuffer,
  input: readonly PdfAnnotOp[] | readonly ResolvedAnnotation[],
): Promise<ExportResult> {
  const resolved: ResolvedAnnotation[] = (input as readonly unknown[]).every((x) => (x as PdfAnnotOp).type)
    ? resolveAnnotations(input as readonly PdfAnnotOp[])
    : [...(input as readonly ResolvedAnnotation[])];
  let doc: PDFDocument;
  try { doc = await PDFDocument.load(pdf); } catch (e) { throw new PdfAnnotError(`Cannot read PDF: ${(e as Error).message}`); }
  const pages = doc.getPages();
  const skipped: ExportResult['skipped'] = [];
  let written = 0;
  for (const { id, annotation } of resolved) {
    const page = pages[annotation.page];
    if (!page) { skipped.push({ id, reason: `page ${annotation.page} does not exist (document has ${pages.length})` }); continue; }
    const normalized = normalizeAnnotation(annotation);
    const ref = buildAnnotation(doc.context, normalized, id, page.ref);
    let annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) {
      annots = doc.context.obj([]);
      page.node.set(PDFName.of('Annots'), annots);
    }
    annots.push(ref);
    written++;
  }
  return { bytes: await doc.save(), written, skipped };
}

/** Read back annotation subtype/contents per page (used for verification and tests). */
export async function listPdfAnnotations(pdf: Uint8Array | ArrayBuffer): Promise<{ page: number; subtype: string; contents: string; id?: string }[]> {
  const doc = await PDFDocument.load(pdf);
  const out: { page: number; subtype: string; contents: string; id?: string }[] = [];
  doc.getPages().forEach((p, i) => {
    const annots = p.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) return;
    for (let k = 0; k < annots.size(); k++) {
      const d = annots.lookupMaybe(k, PDFDict);
      if (!d) continue;
      const st = d.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText() ?? '';
      const c = d.lookupMaybe(PDFName.of('Contents'), PDFString, PDFHexString)?.decodeText() ?? '';
      const nm = d.lookupMaybe(PDFName.of('NM'), PDFString, PDFHexString)?.decodeText();
      out.push({ page: i, subtype: st, contents: c, id: nm });
    }
  });
  return out;
}
