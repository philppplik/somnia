import { arcToCubics, parsePathData, type Segment } from './pathData';
import { isIdentity, multiply, parseTransform } from './matrix';
import { normalizePaint } from './color';
import { inferKind, r3 } from './nodes';
import { parseXml, XmlError, type XmlElement } from './xml';
import { DEFAULT_STYLE, IDENTITY, LIMITS, type Diagnostic, type Matrix, type Point, type Style, type VectorDocument, type VectorNode, type VectorPath } from './types';


export interface ImportOptions {
  /**
   * strict (default): any unsupported feature is an error and the import throws SvgImportError; nothing is
   * silently dropped. strict:false imports the supported part and reports every skipped feature as a warning.
   */
  strict?: boolean;
}
export interface ImportResult { doc: VectorDocument; warnings: Diagnostic[] }
export class SvgImportError extends Error {
  constructor(message: string, readonly diagnostics: Diagnostic[] = []) { super(message); }
}

const NUMRE = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const UNIT: Record<string, number> = { px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, '': 1 };
function length(v: string | undefined, d = 0): number {
  if (v === undefined) return d;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*([a-z%]*)\s*$/i.exec(v);
  if (!m || m[2] === '%' || !(m[2].toLowerCase() in UNIT)) return d;
  return Number(m[1]) * UNIT[m[2].toLowerCase()];
}
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const opacityOf = (v: string | undefined): number | undefined => {
  if (v === undefined) return undefined;
  const s = v.trim();
  const n = s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s);
  return Number.isFinite(n) ? clamp01(n) : undefined;
};
const stripNs = (n: string) => (n.startsWith('svg:') ? n.slice(4) : n);

const STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'display', 'visibility'];
const PLAIN_ATTRS = new Set([...STYLE_PROPS, 'id', 'style', 'transform', 'd', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'points', 'viewBox', 'version', 'preserveAspectRatio', 'xmlns', 'data-name', 'pathLength', 'xml:space', 'baseProfile']);
const ALLOWED = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const IGNORED_NO_RENDER = new Set(['title', 'desc', 'metadata']); // contain no geometry; harmless to drop

function declared(el: XmlElement, err: (m: string) => void): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of STYLE_PROPS) if (el.attrs[p] !== undefined) out[p] = el.attrs[p];
  const st = el.attrs.style;
  if (st) for (const decl of st.split(';')) {
    const k = decl.indexOf(':');
    if (k > 0) {
      const key = decl.slice(0, k).trim().toLowerCase();
      if (!STYLE_PROPS.includes(key)) err(`style property "${key}" is not supported`);
      else out[key] = decl.slice(k + 1).replace(/!important/i, '').trim();
    }
  }
  return out;
}

function cascade(parent: Style, d: Record<string, string>, err: (m: string) => void): Style {
  const s: Style = { ...parent, dashArray: [...parent.dashArray], opacity: 1 };
  for (const key of ['fill', 'stroke'] as const) {
    const raw = d[key];
    if (raw === undefined || raw.trim() === 'inherit') continue;
    const p = normalizePaint(raw);
    if (p === null) err(`unsupported ${key} value "${raw}"`);
    else if (p.startsWith('url(')) err(`${key} references ${p}: gradients and patterns are not supported`);
    else s[key] = p;
  }
  if (d['stroke-width'] !== undefined) s.strokeWidth = Math.max(0, length(d['stroke-width'], s.strokeWidth));
  s.fillOpacity = opacityOf(d['fill-opacity']) ?? s.fillOpacity;
  s.strokeOpacity = opacityOf(d['stroke-opacity']) ?? s.strokeOpacity;
  s.opacity = opacityOf(d.opacity) ?? 1;
  if (d['fill-rule'] === 'evenodd' || d['fill-rule'] === 'nonzero') s.fillRule = d['fill-rule'];
  if (['butt', 'round', 'square'].includes(d['stroke-linecap'])) s.lineCap = d['stroke-linecap'] as Style['lineCap'];
  if (['miter', 'round', 'bevel'].includes(d['stroke-linejoin'])) s.lineJoin = d['stroke-linejoin'] as Style['lineJoin'];
  if (d['stroke-miterlimit'] !== undefined) { const n = parseFloat(d['stroke-miterlimit']); if (Number.isFinite(n)) s.miterLimit = Math.max(1, n); }
  if (d['stroke-dasharray'] !== undefined) {
    const v = d['stroke-dasharray'].trim();
    if (v === 'none') s.dashArray = [];
    else {
      const a = v.split(/[\s,]+/).filter(Boolean).map((x) => length(x, NaN));
      if (a.length && a.every((n) => Number.isFinite(n) && n >= 0) && a.some((n) => n > 0)) s.dashArray = a.length % 2 ? [...a, ...a] : a;
    }
  }
  if (d['stroke-dashoffset'] !== undefined) s.dashOffset = length(d['stroke-dashoffset'], s.dashOffset);
  return s;
}

const K = 0.5522847498307936;
function ellipse(cx: number, cy: number, rx: number, ry: number): Segment[] {
  return [
    { t: 'M', x: cx + rx, y: cy },
    { t: 'C', x1: cx + rx, y1: cy + K * ry, x2: cx + K * rx, y2: cy + ry, x: cx, y: cy + ry },
    { t: 'C', x1: cx - K * rx, y1: cy + ry, x2: cx - rx, y2: cy + K * ry, x: cx - rx, y: cy },
    { t: 'C', x1: cx - rx, y1: cy - K * ry, x2: cx - K * rx, y2: cy - ry, x: cx, y: cy - ry },
    { t: 'C', x1: cx + K * rx, y1: cy - ry, x2: cx + rx, y2: cy - K * ry, x: cx + rx, y: cy },
    { t: 'Z' },
  ];
}
function rect(x: number, y: number, w: number, h: number, rx: number, ry: number): Segment[] {
  if (rx <= 0 || ry <= 0) return [{ t: 'M', x, y }, { t: 'L', x: x + w, y }, { t: 'L', x: x + w, y: y + h }, { t: 'L', x, y: y + h }, { t: 'Z' }];
  const r: Segment[] = [{ t: 'M', x: x + rx, y }, { t: 'L', x: x + w - rx, y }];
  r.push(...arcToCubics(x + w - rx, y, rx, ry, 0, false, true, x + w, y + ry));
  r.push({ t: 'L', x: x + w, y: y + h - ry });
  r.push(...arcToCubics(x + w, y + h - ry, rx, ry, 0, false, true, x + w - rx, y + h));
  r.push({ t: 'L', x: x + rx, y: y + h });
  r.push(...arcToCubics(x + rx, y + h, rx, ry, 0, false, true, x, y + h - ry));
  r.push({ t: 'L', x, y: y + ry });
  r.push(...arcToCubics(x, y + ry, rx, ry, 0, false, true, x + rx, y));
  r.push({ t: 'Z' });
  return r;
}
function poly(points: string | undefined, close: boolean): Segment[] | null {
  const n = (points ?? '').match(NUMRE)?.map(Number) ?? [];
  if (n.length < 4) return null;
  const segs: Segment[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) segs.push({ t: i === 0 ? 'M' : 'L', x: n[i], y: n[i + 1] });
  if (close) segs.push({ t: 'Z' });
  return segs;
}

const ap = (m: Matrix, x: number, y: number): Point => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

interface Contour { nodes: VectorNode[]; closed: boolean }

/** Turn absolute segments into contours with absolute handles (quadratics are elevated to cubics exactly). */
function toContours(segs: Segment[], m: Matrix, nextId: () => string): Contour[] {
  const out: Contour[] = [];
  let cur: Contour | null = null;
  const mk = (p: Point): VectorNode => ({ id: nextId(), x: p.x, y: p.y, kind: 'corner' });
  const finish = () => { if (cur && cur.nodes.length > 1) out.push(cur); cur = null; };
  let cx = 0, cy = 0, sx = 0, sy = 0;
  for (const s of segs) {
    if (s.t === 'M') { finish(); cur = { nodes: [mk(ap(m, s.x, s.y))], closed: false }; cx = sx = s.x; cy = sy = s.y; continue; }
    if (s.t === 'Z') {
      if (cur) {
        cur.closed = true;
        const first = cur.nodes[0], last = cur.nodes[cur.nodes.length - 1];
        // drop a duplicated end node that coincides with the start, merging its incoming handle
        if (cur.nodes.length > 2 && Math.abs(last.x - first.x) < 1e-9 && Math.abs(last.y - first.y) < 1e-9) {
          if (last.in) first.in = last.in;
          cur.nodes.pop();
        }
        finish();
      }
      cx = sx; cy = sy; // a following drawing command (no M) starts a new contour at the subpath start
      continue;
    }
    if (!cur) cur = { nodes: [mk(ap(m, cx, cy))], closed: false };
    const last = cur.nodes[cur.nodes.length - 1];
    if (s.t === 'L') { cur.nodes.push(mk(ap(m, s.x, s.y))); cx = s.x; cy = s.y; continue; }
    let c1: Point, c2: Point;
    if (s.t === 'Q') {
      // exact degree elevation: c1 = p0 + 2/3 (q - p0), c2 = p + 2/3 (q - p)
      c1 = ap(m, cx + (2 / 3) * (s.x1 - cx), cy + (2 / 3) * (s.y1 - cy));
      c2 = ap(m, s.x + (2 / 3) * (s.x1 - s.x), s.y + (2 / 3) * (s.y1 - s.y));
    } else { c1 = ap(m, s.x1, s.y1); c2 = ap(m, s.x2, s.y2); }
    last.out = c1;
    const n = mk(ap(m, s.x, s.y));
    n.in = c2;
    cur.nodes.push(n);
    cx = s.x; cy = s.y;
  }
  finish();
  return out;
}

export function importSvg(source: string, opts: ImportOptions = {}): ImportResult {
  const strict = opts.strict ?? true;
  const diags: Diagnostic[] = [];
  const seen = new Set<string>();
  const bad = (message: string) => { if (!seen.has(message)) { seen.add(message); diags.push({ severity: strict ? 'error' : 'warning', message }); } };
  const info = (message: string) => { if (!seen.has(message)) { seen.add(message); diags.push({ severity: 'warning', message }); } };
  const fail = (message: string): never => { throw new SvgImportError(message, [...diags, { severity: 'error', message }]); };

  if (source.length > LIMITS.maxBytes) fail(`SVG is larger than ${LIMITS.maxBytes} bytes`);
  if (/<!ENTITY/i.test(source)) fail('custom XML entities (<!ENTITY>) are not supported');
  let root: XmlElement;
  try { root = parseXml(source); } catch (e) {
    if (e instanceof XmlError) return fail(`Invalid XML: ${e.message}`);
    throw e;
  }
  if (stripNs(root.name) !== 'svg') fail(`Root element is <${root.name}>, expected <svg>`);

  const par = root.attrs.preserveAspectRatio?.trim();
  if (par && par !== 'xMidYMid meet' && par !== 'xMidYMid') bad(`preserveAspectRatio="${par}" is not supported`);
  let vb: [number, number, number, number] | null = null;
  if (root.attrs.viewBox) {
    const n = root.attrs.viewBox.split(/[\s,]+/).filter(Boolean).map(Number);
    if (n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0) vb = n as [number, number, number, number];
    else bad('invalid viewBox');
  }
  const wAttr = length(root.attrs.width, 0), hAttr = length(root.attrs.height, 0);
  let width = wAttr > 0 ? wAttr : vb ? vb[2] : 0;
  let height = hAttr > 0 ? hAttr : vb ? vb[3] : 0;
  if (!(width > 0 && height > 0)) { bad('no viewBox and no absolute width/height; defaulted to 300x150'); width = 300; height = 150; }
  if (wAttr > 0 && hAttr === 0 && vb) height = (width * vb[3]) / vb[2];
  if (hAttr > 0 && wAttr === 0 && vb) width = (height * vb[2]) / vb[3];
  // Bake viewBox -> document pixel space, so the document origin is 0,0 and handles are in pixels.
  let base: Matrix = IDENTITY;
  if (vb) {
    const sx = width / vb[2], sy = height / vb[3];
    if (Math.abs(sx - sy) > 1e-9 * Math.max(sx, sy)) { // meet: uniform scale, centred
      const s = Math.min(sx, sy);
      base = [s, 0, 0, s, (width - vb[2] * s) / 2 - vb[0] * s, (height - vb[3] * s) / 2 - vb[1] * s];
    } else base = [sx, 0, 0, sy, -vb[0] * sx, -vb[1] * sy];
  }
  const rootTf = parseTransform(root.attrs.transform);
  if (rootTf === null) bad(`malformed transform "${root.attrs.transform}"`);
  base = multiply(base, rootTf ?? IDENTITY);

  const paths: VectorPath[] = [];
  let nodeCount = 0, segCount = 0, idc = 0, compoundC = 0;
  const nextId = () => { if (++nodeCount > LIMITS.maxNodes) fail(`more than ${LIMITS.maxNodes} nodes`); return `n${++idc}`; };
  let pathC = 0;

  function checkAttrs(el: XmlElement) {
    for (const a of Object.keys(el.attrs)) {
      if (/^on/i.test(a)) bad(`event attribute "${a}" is not allowed`);
      else if (/href$/i.test(a)) bad(`reference attribute "${a}" is not supported`);
      else if (a.startsWith('xmlns') || a === 'xml:space' || PLAIN_ATTRS.has(a) || a.startsWith('inkscape:') || a.startsWith('sodipodi:')) continue;
      else if (a === 'clip-path' || a === 'mask' || a === 'filter') bad(`attribute "${a}" is not supported`);
      else if (a === 'class') bad('CSS classes are not supported');
      else info(`attribute "${a}" ignored`);
    }
  }

  function walk(el: XmlElement, parent: Style, m: Matrix, layer: string | undefined, depth: number, hiddenAbove: boolean, groupOpacity: number): void {
    if (depth > LIMITS.maxDepth) fail(`element depth exceeds ${LIMITS.maxDepth}`);
    const name = stripNs(el.name);
    if (IGNORED_NO_RENDER.has(name)) return;
    if (!ALLOWED.has(name)) {
      if (name === 'defs' && el.children.length === 0) return;
      bad(`<${name}> is not supported`);
      return;
    }
    checkAttrs(el);
    const d = declared(el, bad);
    const hidden = hiddenAbove || d.display === 'none' || d.visibility === 'hidden' || d.visibility === 'collapse';
    const tf = parseTransform(el.attrs.transform);
    if (tf === null) bad(`malformed transform "${el.attrs.transform}"`);
    const world = multiply(m, tf ?? IDENTITY);
    const style = cascade(parent, d, bad);
    const label = el.attrs['inkscape:label'] ?? el.attrs['data-name'] ?? el.attrs.id;
    if (name === 'g' || name === 'svg') {
      if (name === 'svg' && depth > 0) { bad('nested <svg> is not supported'); return; }
      const lay = layer ?? (depth === 1 && name === 'g' ? label : undefined);
      const inner = { ...style, opacity: 1 };
      for (const c of el.children) walk(c, inner, world, lay, depth + 1, hidden, groupOpacity * style.opacity);
      return;
    }
    let segments: Segment[] | null = null;
    switch (name) {
      case 'path': {
        const r = parsePathData(el.attrs.d ?? '');
        if (r.error) bad(`path${el.attrs.id ? ` #${el.attrs.id}` : ''}: ${r.error}`);
        segCount += r.segments.length;
        if (segCount > LIMITS.maxSegments) fail(`more than ${LIMITS.maxSegments} path segments`);
        segments = r.segments;
        break;
      }
      case 'rect': {
        const w = length(el.attrs.width), h = length(el.attrs.height);
        if (w <= 0 || h <= 0) { info('zero-size <rect> skipped'); return; }
        let rx = el.attrs.rx !== undefined ? length(el.attrs.rx) : NaN, ry = el.attrs.ry !== undefined ? length(el.attrs.ry) : NaN;
        if (Number.isNaN(rx) && Number.isNaN(ry)) rx = ry = 0; else if (Number.isNaN(rx)) rx = ry; else if (Number.isNaN(ry)) ry = rx;
        segments = rect(length(el.attrs.x), length(el.attrs.y), w, h, Math.min(Math.max(rx, 0), w / 2), Math.min(Math.max(ry, 0), h / 2));
        break;
      }
      case 'circle': { const r = length(el.attrs.r); if (r <= 0) { info('zero-radius <circle> skipped'); return; } segments = ellipse(length(el.attrs.cx), length(el.attrs.cy), r, r); break; }
      case 'ellipse': { const rx = length(el.attrs.rx), ry = length(el.attrs.ry); if (rx <= 0 || ry <= 0) { info('zero-radius <ellipse> skipped'); return; } segments = ellipse(length(el.attrs.cx), length(el.attrs.cy), rx, ry); break; }
      case 'line': segments = [{ t: 'M', x: length(el.attrs.x1), y: length(el.attrs.y1) }, { t: 'L', x: length(el.attrs.x2), y: length(el.attrs.y2) }]; break;
      case 'polyline': segments = poly(el.attrs.points, false); break;
      default: segments = poly(el.attrs.points, true); break; // polygon
    }
    if (!segments) { info(`<${name}> without usable geometry skipped`); return; }
    const contours = toContours(segments, world, nextId);
    if (!contours.length) { info(`<${name}> produced no drawable contour`); return; }
    // Stroke width, dashes and miter scale with the transform; non-uniform scale is approximated by sqrt(|det|).
    const scale = Math.sqrt(Math.abs(world[0] * world[3] - world[1] * world[2])) || 1;
    if (Math.abs(Math.hypot(world[0], world[1]) - Math.hypot(world[2], world[3])) > 1e-6 * scale && style.stroke !== 'none') info('non-uniform scale: stroke width approximated');
    const st: Partial<Style> = {};
    const full: Style = { ...style, strokeWidth: style.strokeWidth * scale, dashArray: style.dashArray.map((n) => n * scale), dashOffset: style.dashOffset * scale, opacity: style.opacity * groupOpacity };
    for (const k of Object.keys(DEFAULT_STYLE) as (keyof Style)[]) {
      if (JSON.stringify(full[k]) !== JSON.stringify(DEFAULT_STYLE[k])) (st as Record<string, unknown>)[k] = full[k];
    }
    if (groupOpacity !== 1) info('group opacity was multiplied into each child path (overlapping children may differ)');
    const compound = contours.length > 1 ? `c${++compoundC}` : undefined;
    const baseName = label;
    for (const c of contours) {
      for (const n of c.nodes) {
        // a handle sitting on its node is a retracted handle: represent it as absent
        if (n.in && n.in.x === n.x && n.in.y === n.y) delete n.in;
        if (n.out && n.out.x === n.x && n.out.y === n.y) delete n.out;
        n.kind = inferKind(n.x, n.y, n.in, n.out);
      }
      const p: VectorPath = { id: `p${++pathC}`, closed: c.closed, nodes: c.nodes };
      if (Object.keys(st).length) p.style = { ...st, dashArray: st.dashArray ? [...st.dashArray] : undefined } as Partial<Style>;
      if (p.style && p.style.dashArray === undefined) delete p.style.dashArray;
      if (layer !== undefined) p.layer = layer;
      if (compound) p.compound = compound;
      if (baseName !== undefined) p.name = baseName;
      if (hidden) p.hidden = true;
      paths.push(p);
    }
  }
  walk(root, { ...DEFAULT_STYLE, dashArray: [] }, base, undefined, 0, false, 1);
  if (strict && diags.some((x) => x.severity === 'error')) {
    throw new SvgImportError(`Unsupported SVG: ${diags.filter((x) => x.severity === 'error').map((x) => x.message).join('; ')}`, diags);
  }
  const doc: VectorDocument = { width: r3(width), height: r3(height), paths };
  return { doc, warnings: diags.filter((x) => x.severity === 'warning') };
}
