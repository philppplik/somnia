import {
  PDF_ANNOT_ADD, PDF_ANNOT_DOC_SCHEMA, PDF_ANNOT_OP_VERSION, PDF_ANNOT_REMOVE, PDF_ANNOT_UPDATE,
  type InkAnnotation, type JsonValue, type PdfAnnotDocument, type PdfAnnotKind, type PdfAnnotOp,
  type PdfAnnotation, type Point, type Rect, type ResolvedAnnotation, type RgbColor,
} from './types';

const KINDS: readonly PdfAnnotKind[] = ['highlight', 'underline', 'strikeout', 'note', 'ink'];
export const DEFAULT_COLORS: Record<PdfAnnotKind, RgbColor> = {
  highlight: [1, 0.92, 0.2], underline: [0.1, 0.5, 0.2], strikeout: [0.85, 0.1, 0.1],
  note: [1, 0.8, 0], ink: [0.1, 0.2, 0.9],
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class PdfAnnotError extends Error {
  constructor(message: string) { super(message); this.name = 'PdfAnnotError'; }
}

function normColor(v: unknown, fallback: RgbColor): RgbColor {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(fin)) return fallback;
  return [clamp(v[0], 0, 1), clamp(v[1], 0, 1), clamp(v[2], 0, 1)];
}
function normRect(v: unknown): Rect {
  const r = v as Partial<Rect> | null;
  if (!r || !fin(r.x) || !fin(r.y) || !fin(r.width) || !fin(r.height)) throw new PdfAnnotError('Invalid rect');
  // Accept negative sizes by flipping.
  const x = r.width < 0 ? r.x + r.width : r.x;
  const y = r.height < 0 ? r.y + r.height : r.y;
  const width = Math.abs(r.width), height = Math.abs(r.height);
  if (width === 0 || height === 0) throw new PdfAnnotError('Rect must have non-zero size');
  return { x, y, width, height };
}
function normPoint(v: unknown): Point {
  const p = v as Partial<Point> | null;
  if (!p || !fin(p.x) || !fin(p.y)) throw new PdfAnnotError('Invalid point');
  return { x: p.x, y: p.y };
}

/** Validate + normalize a loose annotation into a strict one. Throws PdfAnnotError. */
export function normalizeAnnotation(input: unknown): PdfAnnotation {
  const a = input as Record<string, unknown> | null;
  if (!a || typeof a !== 'object') throw new PdfAnnotError('Annotation must be an object');
  const kind = a.kind as PdfAnnotKind;
  if (!KINDS.includes(kind)) throw new PdfAnnotError(`Unknown annotation kind: ${String(a.kind)}`);
  if (!Number.isInteger(a.page) || (a.page as number) < 0) throw new PdfAnnotError('page must be a non-negative integer');
  const base = {
    page: a.page as number,
    color: normColor(a.color, DEFAULT_COLORS[kind]),
    opacity: fin(a.opacity) ? clamp(a.opacity, 0, 1) : kind === 'highlight' ? 0.4 : 1,
    contents: typeof a.contents === 'string' ? a.contents : '',
    author: typeof a.author === 'string' ? a.author : '',
  };
  if (kind === 'highlight' || kind === 'underline' || kind === 'strikeout') {
    if (!Array.isArray(a.rects) || a.rects.length === 0) throw new PdfAnnotError('Markup needs at least one rect');
    return { ...base, kind, rects: a.rects.map(normRect) };
  }
  if (kind === 'note') {
    return { ...base, kind, position: normPoint(a.position) };
  }
  if (!Array.isArray(a.strokes) || a.strokes.length === 0) throw new PdfAnnotError('Ink needs at least one stroke');
  const strokes = a.strokes.map((s) => {
    if (!Array.isArray(s)) throw new PdfAnnotError('Stroke must be an array of points');
    const pts = s.map(normPoint);
    if (pts.length < 2) throw new PdfAnnotError('Stroke needs at least 2 points');
    return pts;
  });
  const width = fin(a.width) ? clamp(a.width, 0.1, 100) : 2;
  const ink: InkAnnotation = { ...base, kind, strokes, width };
  return ink;
}

const json = (v: unknown): JsonValue => JSON.parse(JSON.stringify(v)) as JsonValue;
const op = (id: string, type: PdfAnnotOp['type'], params: PdfAnnotOp['params']): PdfAnnotOp =>
  ({ id, type, version: PDF_ANNOT_OP_VERSION, enabled: true, params });

/** Op ids identify the annotation they create; update/remove reference it via params.target. */
export function addAnnotationOp(id: string, annotation: unknown): PdfAnnotOp {
  return op(id, PDF_ANNOT_ADD, { annotation: json(normalizeAnnotation(annotation)) });
}
export function updateAnnotationOp(id: string, target: string, patch: Record<string, unknown>): PdfAnnotOp {
  if ('kind' in patch) throw new PdfAnnotError('kind cannot be changed');
  return op(id, PDF_ANNOT_UPDATE, { target, patch: json(patch) });
}
export function removeAnnotationOp(id: string, target: string): PdfAnnotOp {
  return op(id, PDF_ANNOT_REMOVE, { target });
}

/** Replay ops in order into the live annotation list. Disabled ops are skipped; unknown targets are ignored. */
export function resolveAnnotations(ops: readonly PdfAnnotOp[]): ResolvedAnnotation[] {
  const list: ResolvedAnnotation[] = [];
  for (const o of ops) {
    if (!o.enabled) continue;
    if (o.type === PDF_ANNOT_ADD) {
      if (list.some((r) => r.id === o.id)) throw new PdfAnnotError(`Duplicate annotation id: ${o.id}`);
      list.push({ id: o.id, annotation: normalizeAnnotation(o.params.annotation) });
    } else if (o.type === PDF_ANNOT_UPDATE) {
      const i = list.findIndex((r) => r.id === o.params.target);
      if (i < 0) continue;
      const merged = { ...list[i].annotation, ...(o.params.patch as object), kind: list[i].annotation.kind };
      list[i] = { id: list[i].id, annotation: normalizeAnnotation(merged) };
    } else if (o.type === PDF_ANNOT_REMOVE) {
      const i = list.findIndex((r) => r.id === o.params.target);
      if (i >= 0) list.splice(i, 1);
    } else {
      throw new PdfAnnotError(`Unknown op type: ${String((o as PdfAnnotOp).type)}`);
    }
  }
  return list;
}

export function serializeAnnotOps(ops: readonly PdfAnnotOp[]): string {
  const doc: PdfAnnotDocument = { schema: PDF_ANNOT_DOC_SCHEMA, ops: [...ops] };
  return JSON.stringify(doc);
}
export function parseAnnotOps(text: string): PdfAnnotOp[] {
  let doc: PdfAnnotDocument;
  try { doc = JSON.parse(text) as PdfAnnotDocument; } catch { throw new PdfAnnotError('Invalid JSON'); }
  if (!doc || doc.schema !== PDF_ANNOT_DOC_SCHEMA || !Array.isArray(doc.ops)) throw new PdfAnnotError('Unsupported annotation document');
  for (const o of doc.ops) {
    if (!o || typeof o.id !== 'string' || typeof o.type !== 'string' || typeof o.params !== 'object' || o.params === null) {
      throw new PdfAnnotError('Malformed op');
    }
    if (o.version !== PDF_ANNOT_OP_VERSION) throw new PdfAnnotError(`Unsupported op version: ${String(o.version)}`);
  }
  resolveAnnotations(doc.ops); // full validation
  return doc.ops;
}

/** Convenience: bounding rect(s) -> annotation rect list is just the identity; flips handled in normalizeRect. */
export function rectToQuadPoints(r: Rect): number[] {
  // PDF spec order as used by Acrobat: top-left, top-right, bottom-left, bottom-right.
  const x2 = r.x + r.width, y2 = r.y + r.height;
  return [r.x, y2, x2, y2, r.x, r.y, x2, r.y];
}
