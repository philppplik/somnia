import { segmentAt, segmentCount } from './path';
import type { VectorDocument, VectorPath } from './types';

/** Minimal Canvas2D surface so tests can pass a recorder. CanvasRenderingContext2D satisfies it. */
export interface Ctx2D {
  beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void;
  closePath(): void; fill(rule?: 'nonzero' | 'evenodd'): void; stroke(): void; arc(x: number, y: number, r: number, s: number, e: number): void;
  fillRect(x: number, y: number, w: number, h: number): void; strokeRect(x: number, y: number, w: number, h: number): void;
  save(): void; restore(): void;
  fillStyle: unknown; strokeStyle: unknown; lineWidth: number;
}

/** Adds the path to the current canvas path (no begin/fill/stroke). */
export function tracePath(ctx: Ctx2D, p: VectorPath): void {
  if (p.nodes.length === 0) return;
  ctx.moveTo(p.nodes[0].x, p.nodes[0].y);
  for (let i = 0; i < segmentCount(p); i++) {
    const c = segmentAt(p, i);
    if (c.c1 === c.p0 && c.c2 === c.p1) ctx.lineTo(c.p1.x, c.p1.y);
    else ctx.bezierCurveTo(c.c1.x, c.c1.y, c.c2.x, c.c2.y, c.p1.x, c.p1.y);
  }
  if (p.closed) ctx.closePath();
}

/** Defaults: no fill, black 1px stroke. */
export function renderPath(ctx: Ctx2D, p: VectorPath): void {
  const fill = p.fill ?? null, stroke = p.stroke === undefined ? '#000000' : p.stroke, w = p.strokeWidth ?? 1;
  ctx.save(); ctx.beginPath(); tracePath(ctx, p);
  if (fill) { ctx.fillStyle = fill; ctx.fill(p.fillRule ?? 'nonzero'); }
  if (stroke && w > 0) { ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.stroke(); }
  ctx.restore();
}
export function renderDocument(ctx: Ctx2D, doc: VectorDocument): void { for (const p of doc.paths) renderPath(ctx, p); }

/** Editing overlay: handle lines/dots and node squares. `scale` keeps sizes constant in screen px. */
export function renderOverlay(ctx: Ctx2D, p: VectorPath, opts: { scale?: number; color?: string } = {}): void {
  const k = 1 / (opts.scale ?? 1);
  ctx.save(); ctx.strokeStyle = opts.color ?? '#2563eb'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = k;
  for (const a of p.nodes) {
    for (const h of [a.in, a.out]) {
      if (!h) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(h.x, h.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x, h.y, 3 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.fillRect(a.x - 3 * k, a.y - 3 * k, 6 * k, 6 * k); ctx.strokeRect(a.x - 3 * k, a.y - 3 * k, 6 * k, 6 * k);
  }
  ctx.restore();
}
