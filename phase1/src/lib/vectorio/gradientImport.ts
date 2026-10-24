import { isIdentity, parseTransform } from './matrix';
import { normalizePaint } from './color';
import { GRADIENT_ID, cleanGradient, cleanStops } from './gradient';
import type { Gradient, GradientStop, Matrix, VectorNode } from './types';
import { GRADIENT_LIMITS } from './types';
import type { XmlElement } from './xml';

const stripNs = (n: string) => n.replace(/^.*:/, '');
const isGrad = (el: XmlElement) => { const n = stripNs(el.name); return n === 'linearGradient' || n === 'radialGradient'; };
export const isGradientElement = isGrad;

interface Box { minX: number; minY: number; maxX: number; maxY: number }
/** Box of a set of contours, sampling each cubic segment (error well under a pixel for editor-sized shapes). */
export function nodesBox(contours: readonly { nodes: VectorNode[]; closed: boolean }[]): Box | null {
  let b: Box | null = null;
  const add = (x: number, y: number) => { b = b ? { minX: Math.min(b.minX, x), minY: Math.min(b.minY, y), maxX: Math.max(b.maxX, x), maxY: Math.max(b.maxY, y) } : { minX: x, minY: y, maxX: x, maxY: y }; };
  for (const c of contours) {
    const n = c.nodes.length, count = n < 2 ? 0 : n - (c.closed ? 0 : 1);
    for (const nd of c.nodes) add(nd.x, nd.y);
    for (let i = 0; i < count; i++) {
      const a = c.nodes[i], d = c.nodes[(i + 1) % n];
      if (!a.out && !d.in) continue;
      const c1 = a.out ?? a, c2 = d.in ?? d;
      for (let s = 1; s < 32; s++) {
        const t = s / 32, u = 1 - t;
        add(u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * d.x, u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * d.y);
      }
    }
  }
  return b;
}

type Report = (message: string) => void;

/** Reads every <linearGradient>/<radialGradient> in the file and converts each use to document-level bounding-box gradients. */
export function createGradientResolver(root: XmlElement, bad: Report, info: Report) {
  const byId = new Map<string, XmlElement>();
  (function scan(el: XmlElement) { for (const c of el.children) { if (isGrad(c) && c.attrs.id && !byId.has(c.attrs.id)) byId.set(c.attrs.id, c); scan(c); } })(root);
  const out: Gradient[] = [];
  const known = new Set<string>(), byKey = new Map<string, string>();
  const done = new Map<string, string | null>();

  const chain = (el: XmlElement): XmlElement[] => {
    const list = [el];
    for (let i = 0; i < 4; i++) {
      const ref = list[list.length - 1].attrs['xlink:href'] ?? list[list.length - 1].attrs.href;
      const next = ref && ref.startsWith('#') ? byId.get(ref.slice(1)) : undefined;
      if (!next || list.includes(next)) break;
      list.push(next);
    }
    return list;
  };
  const attr = (list: XmlElement[], name: string): string | undefined => { for (const e of list) if (e.attrs[name] !== undefined) return e.attrs[name]; return undefined; };
  const num = (v: string | undefined, dflt: number, units: 'obb' | 'user', what: string): number => {
    if (v === undefined) return dflt;
    const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(%|px)?\s*$/.exec(v);
    if (!m) { bad(`gradient ${what} "${v}" is not supported`); return dflt; }
    const n = Number(m[1]);
    if (m[2] === '%') { if (units === 'user') { bad(`gradient ${what} in % with userSpaceOnUse is not supported`); return dflt; } return n / 100; }
    return n;
  };
  const stopsOf = (list: XmlElement[], id: string): GradientStop[] => {
    const holder = list.find((e) => e.children.some((c) => stripNs(c.name) === 'stop'));
    const stops: GradientStop[] = [];
    for (const c of holder?.children ?? []) {
      if (stripNs(c.name) !== 'stop') continue;
      const css = Object.fromEntries((c.attrs.style ?? '').split(';').map((x) => x.split(':').map((y) => y.trim())).filter((x) => x.length === 2 && x[0]));
      const rawColor = css['stop-color'] ?? c.attrs['stop-color'] ?? 'black';
      let color = normalizePaint(rawColor);
      if (color === null || color === 'none' || color.startsWith('url(') || color === 'currentColor') { bad(`gradient stop colour "${rawColor}" is not supported`); color = '#000000'; }
      let opacity = Number(css['stop-opacity'] ?? c.attrs['stop-opacity'] ?? 1); if (!Number.isFinite(opacity)) opacity = 1;
      const m = /^#([0-9a-f]{6})([0-9a-f]{2})$/.exec(color);
      if (m) { color = '#' + m[1]; opacity *= parseInt(m[2], 16) / 255; }
      const off = c.attrs.offset ?? '0', om = /^\s*([-+]?[\d.]+(?:e[-+]?\d+)?)(%?)\s*$/i.exec(off);
      stops.push({ offset: om ? (om[2] ? Number(om[1]) / 100 : Number(om[1])) : 0, color, opacity });
    }
    if (!stops.length) { bad(`gradient "${id}" has no stops`); return [{ offset: 0, color: '#000000', opacity: 1 }]; }
    if (stops.length > GRADIENT_LIMITS.maxStops) bad(`gradient "${id}" has more than ${GRADIENT_LIMITS.maxStops} stops`);
    return cleanStops(stops);
  };

  /** True when `id` names a gradient we can resolve (existence only; validity is reported by `resolve`). */
  const has = (id: string) => byId.has(id);

  function resolve(id: string, world: Matrix, box: Box | null): string | null {
    const el = byId.get(id);
    if (!el) return null;
    const list = chain(el);
    const units = attr(list, 'gradientUnits') === 'userSpaceOnUse' ? 'user' : 'obb';
    const key = units === 'obb' ? id : `${id}|${world.map((n) => Math.round(n * 1e6) / 1e6).join(',')}|${box ? [box.minX, box.minY, box.maxX, box.maxY].map((n) => Math.round(n * 1e3)).join(',') : ''}`;
    if (done.has(key)) return done.get(key)!;
    const gt = attr(list, 'gradientTransform');
    if (gt !== undefined) { const tf = parseTransform(gt); if (tf === null || !isIdentity(tf)) { bad('gradientTransform is not supported'); done.set(key, null); return null; } }
    const spread = attr(list, 'spreadMethod');
    if (spread !== undefined && spread !== 'pad') bad(`spreadMethod="${spread}" is not supported (pad only)`);
    const stops = stopsOf(list, id);
    const radial = stripNs(el.name) === 'radialGradient';
    if (units === 'obb' && (world[1] !== 0 || world[2] !== 0)) info(`gradient "${id}" on a rotated or skewed object is approximated`);
    let g: Gradient;
    const w = box ? box.maxX - box.minX : 0, h = box ? box.maxY - box.minY : 0;
    if (units === 'user' && (!box || w <= 0 || h <= 0)) { info(`gradient "${id}" on a zero-size object was dropped (zero-size object, no fill)`); done.set(key, null); return null; }
    const toBox = (x: number, y: number) => {
      const dx = world[0] * x + world[2] * y + world[4], dy = world[1] * x + world[3] * y + world[5];
      return { x: (dx - box!.minX) / w, y: (dy - box!.minY) / h };
    };
    if (!radial) {
      const a = [num(attr(list, 'x1'), 0, units, 'x1'), num(attr(list, 'y1'), 0, units, 'y1'), num(attr(list, 'x2'), 1, units, 'x2'), num(attr(list, 'y2'), 0, units, 'y2')];
      if (units === 'user') { const p = toBox(a[0], a[1]), q = toBox(a[2], a[3]); g = { id: '', kind: 'linear', x1: p.x, y1: p.y, x2: q.x, y2: q.y, stops }; }
      else g = { id: '', kind: 'linear', x1: a[0], y1: a[1], x2: a[2], y2: a[3], stops };
    } else {
      const c = [num(attr(list, 'cx'), 0.5, units, 'cx'), num(attr(list, 'cy'), 0.5, units, 'cy'), num(attr(list, 'r'), 0.5, units, 'r')];
      const fx = attr(list, 'fx'), fy = attr(list, 'fy');
      if ((fx !== undefined && num(fx, c[0], units, 'fx') !== c[0]) || (fy !== undefined && num(fy, c[1], units, 'fy') !== c[1])) info(`gradient "${id}": focal point ignored`);
      if (units === 'user') {
        const p = toBox(c[0], c[1]), scale = Math.sqrt(Math.abs(world[0] * world[3] - world[1] * world[2])) || 1;
        if (Math.abs(w / h - 1) > 0.02) info(`radial gradient "${id}" was approximated as a bounding-box circle`);
        g = { id: '', kind: 'radial', cx: p.x, cy: p.y, r: (c[2] * scale) / Math.sqrt(w * h), stops };
      } else g = { id: '', kind: 'radial', cx: c[0], cy: c[1], r: c[2], stops };
    }
    const clean = cleanGradient(g);
    const sig = JSON.stringify({ ...clean, id: '' });
    let docId = byKey.get(sig);
    if (docId === undefined) {
      if (out.length >= GRADIENT_LIMITS.maxGradients) { bad(`more than ${GRADIENT_LIMITS.maxGradients} gradients`); done.set(key, null); return null; }
      docId = GRADIENT_ID.test(id) && units === 'obb' && !known.has(id) ? id : '';
      for (let n = 1; docId === ''; n++) { const cand = `vsg${n}`; if (!known.has(cand)) docId = cand; }
      known.add(docId); byKey.set(sig, docId); out.push({ ...clean, id: docId });
    }
    done.set(key, docId);
    return docId;
  }
  return { has, resolve, gradients: out };
}
