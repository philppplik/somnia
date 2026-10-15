import { parseGuides } from './guides';
import { parseSwatches } from './swatches';
import { parseTextElement, TEXT_LIMITS } from './text';
import { arcToCubics, parsePathData, type Segment } from './pathData';
import { isIdentity, multiply, parseTransform } from './matrix';
import { normalizePaint } from './color';
import { inferKind, r3 } from './nodes';
import { createGradientResolver, isGradientElement, nodesBox } from './gradientImport';
import { parseXml, XmlError, type XmlElement } from './xml';
import { isArrowKind, type ArrowKind } from './arrows';
import { IMAGE_LIMITS, parseImageElement } from './image';
import { FX_KEYS, fxStyle, hasFx, parseFxFilter, type FxSpec } from './effects';
import { BLEND_MODES, DEFAULT_STYLE, IDENTITY, LIMITS, type BlendMode, type Diagnostic, type Matrix, type Point, type Style, type VectorDocument, type VectorNode, type VectorPath } from './types';


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

const STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'mix-blend-mode', 'filter', 'marker-start', 'marker-end', 'display', 'visibility'];
/** Editor-group ids are bounded and plain; anything else is ignored so the content just loads ungrouped. */
const groupIdOf = (v: string | undefined): string | undefined => (v !== undefined && /^[A-Za-z0-9_.:-]{1,64}$/.test(v) ? v : undefined);
const PLAIN_ATTRS = new Set([...STYLE_PROPS, 'id', 'style', 'transform', 'd', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'points', 'viewBox', 'version', 'preserveAspectRatio', 'xmlns', 'data-name', 'data-vs-group', 'data-vs-group-name', 'data-vs-locked', 'data-vs-guides', 'data-vs-swatches', 'clip-rule', 'pathLength', 'xml:space', 'baseProfile']);
const ALLOWED = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const CLIP_SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
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

function cascade(parent: Style, d: Record<string, string>, err: (m: string) => void, hasGradient: (id: string) => boolean, arrowOf: (id: string) => ArrowKind | undefined = () => undefined, fxOf: (id: string) => FxSpec | undefined = () => undefined): Style {
  const s: Style = { ...parent, dashArray: [...parent.dashArray], opacity: 1 };
  for (const key of ['fill', 'stroke'] as const) {
    const raw = d[key];
    if (raw === undefined || raw.trim() === 'inherit') continue;
    const p = normalizePaint(raw);
    if (p === null) err(`unsupported ${key} value "${raw}"`);
    else if (p.startsWith('url(')) {
      const ref = /^url\(\s*#([^)\s]+)\s*\)/.exec(p)?.[1];
      if (key === 'stroke') err(`stroke references ${p}: stroke gradients and patterns are not supported`);
      else if (ref === undefined || !hasGradient(ref)) err(`fill references ${p}: only linear and radial gradients defined in the file are supported`);
      else s[key] = `url(#${ref})`;
    } else s[key] = p;
  }
  if (d['stroke-width'] !== undefined) s.strokeWidth = Math.max(0, length(d['stroke-width'], s.strokeWidth));
  s.fillOpacity = opacityOf(d['fill-opacity']) ?? s.fillOpacity;
  s.strokeOpacity = opacityOf(d['stroke-opacity']) ?? s.strokeOpacity;
  s.opacity = opacityOf(d.opacity) ?? 1;
  s.blendMode = 'normal'; // not inherited
  for (const k of FX_KEYS) delete s[k]; // effects are not inherited
  if (d.filter !== undefined && d.filter.trim() !== 'none') {
    const ref = /^url\(\s*#([^)\s]+)\s*\)$/.exec(d.filter.trim())?.[1];
    const f = ref === undefined ? undefined : fxOf(ref);
    if (f === undefined) err(`filter "${d.filter}": only the blur and shadow effects this editor writes are supported`);
    else Object.assign(s, fxStyle(f));
  }
  s.arrowStart = 'none'; s.arrowEnd = 'none';
  for (const [prop, key] of [['marker-start', 'arrowStart'], ['marker-end', 'arrowEnd']] as const) {
    const raw = d[prop]?.trim();
    if (raw === undefined || raw === 'none') continue;
    const kind = /^url\(\s*#([^)\s]+)\s*\)$/.exec(raw)?.[1];
    const a = kind === undefined ? undefined : arrowOf(kind);
    if (a === undefined) err(`${prop} "${raw}": only the arrowhead markers this editor writes are supported`);
    else s[key] = a;
  }
  if (d['mix-blend-mode'] !== undefined) {
    const v = d['mix-blend-mode'].trim().toLowerCase();
    if ((BLEND_MODES as readonly string[]).includes(v)) s.blendMode = v as BlendMode;
    else err(`mix-blend-mode "${d['mix-blend-mode']}" is not supported`);
  }
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

  const grads = createGradientResolver(root, bad, info);
  const clips = new Map<string, XmlElement>();
  const collectClips = (e: XmlElement, n = 0): void => {
    if (n > LIMITS.maxDepth) return;
    if (stripNs(e.name) === 'clipPath') { if (e.attrs.id !== undefined && clips.size < 500 && !clips.has(e.attrs.id)) clips.set(e.attrs.id, e); return; }
    for (const c of e.children) collectClips(c, n + 1);
  };
  collectClips(root);
  const arrowMarkers = new Map<string, ArrowKind>();
  const collectMarkers = (e: XmlElement): void => {
    if (stripNs(e.name) === 'marker') { const k = e.attrs['data-vs-arrow']; if (e.attrs.id && isArrowKind(k) && k !== 'none') arrowMarkers.set(e.attrs.id, k); }
    for (const c of e.children) collectMarkers(c);
  };
  collectMarkers(root);
  const fxFilters = new Map<string, FxSpec>();
  const collectFx = (e: XmlElement, n = 0): void => {
    if (n > LIMITS.maxDepth) return;
    if (stripNs(e.name) === 'filter') {
      const r = parseFxFilter({ ...e, name: 'filter', children: e.children.map((c) => ({ ...c, name: stripNs(c.name) })) });
      if ('error' in r) bad(r.error);
      else if (e.attrs.id !== undefined && fxFilters.size < 500 && !fxFilters.has(e.attrs.id)) fxFilters.set(e.attrs.id, r.fx);
      return;
    }
    for (const c of e.children) collectFx(c, n + 1);
  };
  collectFx(root);
  let clipC = 0;
  const paths: VectorPath[] = [];
  const texts: import('./types').VectorText[] = [];
  const images: import('./types').VectorImage[] = [];
  let imgChars = 0;
  const groupNames: Record<string, string> = {};
  let nodeCount = 0, segCount = 0, idc = 0, compoundC = 0;
  const nextId = () => { if (++nodeCount > LIMITS.maxNodes) fail(`more than ${LIMITS.maxNodes} nodes`); return `n${++idc}`; };
  let pathC = 0;

  function checkAttrs(el: XmlElement) {
    for (const a of Object.keys(el.attrs)) {
      if (/^on/i.test(a)) bad(`event attribute "${a}" is not allowed`);
      else if (/href$/i.test(a)) bad(`reference attribute "${a}" is not supported`);
      else if (a.startsWith('xmlns') || a === 'xml:space' || PLAIN_ATTRS.has(a) || a.startsWith('inkscape:') || a.startsWith('sodipodi:')) continue;
      else if (a === 'clip-path') continue; // resolved in walk()
      else if (a === 'mask') bad(`attribute "${a}" is not supported`);
      else if (a === 'class') bad('CSS classes are not supported');
      else info(`attribute "${a}" ignored`);
    }
  }

  function walk(el: XmlElement, parent: Style, m: Matrix, layer: string | undefined, depth: number, hiddenAbove: boolean, groupOpacity: number, group?: string): void {
    if (depth > LIMITS.maxDepth) fail(`element depth exceeds ${LIMITS.maxDepth}`);
    const name = stripNs(el.name);
    if (IGNORED_NO_RENDER.has(name)) return;
    if (name === 'clipPath') return; // read up front, validated where it is used
    if (name === 'image') {
      if (depth !== 1) { bad('<image> is only read at the top level of the document (not inside groups)'); return; }
      if (images.length >= IMAGE_LIMITS.maxImages) { bad(`more than ${IMAGE_LIMITS.maxImages} images`); return; }
      const im = parseImageElement(el, `i${images.length + 1}`, bad);
      if (im) { imgChars += im.href.length; if (imgChars > IMAGE_LIMITS.maxTotalChars) bad('images are larger than the total limit'); else images.push(im); }
      return;
    }
    if (name === 'text') {
      if (depth !== 1) { bad('<text> is only read at the top level of the document (not inside groups)'); return; }
      if (texts.length >= TEXT_LIMITS.maxTexts) { bad(`more than ${TEXT_LIMITS.maxTexts} text objects`); return; }
      const t = parseTextElement(el, `t${texts.length + 1}`, bad);
      if (t) texts.push(t);
      return;
    }
    if (!ALLOWED.has(name)) {
      if (name === 'defs' && el.children.every((c) => isGradientElement(c) || stripNs(c.name) === 'clipPath' || (stripNs(c.name) === 'filter' && fxFilters.has(c.attrs.id ?? '')) || (stripNs(c.name) === 'marker' && arrowMarkers.has(c.attrs.id ?? '')))) return; // gradients are read up front
      if (isGradientElement(el)) return;
      bad(`<${name}> is not supported`);
      return;
    }
    checkAttrs(el);
    const d = declared(el, bad);
    const hidden = hiddenAbove || d.display === 'none' || d.visibility === 'hidden' || d.visibility === 'collapse';
    const tf = parseTransform(el.attrs.transform);
    if (tf === null) bad(`malformed transform "${el.attrs.transform}"`);
    const world = multiply(m, tf ?? IDENTITY);
    const style = cascade(parent, d, bad, grads.has, (id) => arrowMarkers.get(id), (id) => fxFilters.get(id));
    if ((style.arrowStart !== 'none' || style.arrowEnd !== 'none') && name === 'g') bad('marker-start/marker-end on a group are not supported; set them on the path');
    if (name === 'g' && hasFx(style)) bad('filter on a group is not supported; set the effect on the shapes');
    if (name === 'g' && style.blendMode !== 'normal') bad('mix-blend-mode on a group is not supported; set it on the shapes');
    const label = el.attrs['inkscape:label'] ?? el.attrs['data-name'] ?? el.attrs.id;
    // clip-path: the element becomes a clipping group (editor group + mask shape); groups do not nest
    let clipEl: XmlElement | undefined;
    const clipAttr = el.attrs['clip-path'];
    if (clipAttr !== undefined && clipAttr.trim() !== 'none') {
      const mm = /^url\(\s*#([A-Za-z][\w:.-]*)\s*\)$/.exec(clipAttr.trim());
      clipEl = mm ? clips.get(mm[1]) : undefined;
      if (!clipEl) bad(`clip-path "${clipAttr.slice(0, 60)}" does not reference a supported <clipPath>`);
      else if (group !== undefined || name === 'svg') { bad('clip-path inside a group (or on the root) is not supported: clipping groups do not nest'); clipEl = undefined; }
    }
    const clipGroup = clipEl ? `clip${++clipC}` : undefined;
    const appendClip = (gid: string | undefined): void => {
      if (!clipEl || gid === undefined) return;
      const cm = parseTransform(clipEl.attrs.transform);
      if (cm === null) { bad(`malformed transform "${clipEl.attrs.transform}" on <clipPath>`); return; }
      if (clipEl.attrs.clipPathUnits !== undefined && clipEl.attrs.clipPathUnits !== 'userSpaceOnUse') { bad('clip-path with clipPathUnits="objectBoundingBox" is not supported'); return; }
      if (clipEl.attrs['clip-path'] !== undefined) { bad('a <clipPath> that is itself clipped is not supported'); return; }
      const kids = clipEl.children.filter((c) => !IGNORED_NO_RENDER.has(stripNs(c.name)));
      if (kids.length !== 1 || !CLIP_SHAPES.has(stripNs(kids[0].name))) { bad('a <clipPath> must contain exactly one shape (path, rect, circle, ellipse, line, polyline or polygon)'); return; }
      const before = paths.length;
      walk(kids[0], { ...DEFAULT_STYLE, dashArray: [] }, multiply(world, cm ?? IDENTITY), undefined, depth + 1, false, 1, gid);
      const made = paths.splice(before);
      if (!made.length) { bad('the <clipPath> shape has no drawable contour'); return; }
      const evenodd = kids[0].attrs['clip-rule'] === 'evenodd';
      for (const p of made) { p.clip = true; p.style = { fill: 'none', stroke: 'none', ...(evenodd ? { fillRule: 'evenodd' as const } : {}) }; }
      paths.push(...made);
    };
    if (name === 'g' || name === 'svg') {
      if (name === 'svg' && depth > 0) { bad('nested <svg> is not supported'); return; }
      const own = name === 'g' ? (groupIdOf(el.attrs['data-vs-group']) ?? clipGroup) : undefined;
      const gname = own !== undefined ? el.attrs['data-vs-group-name']?.trim().slice(0, 80) : undefined;
      if (own !== undefined && gname && !groupNames[own]) groupNames[own] = gname;
      const lay = layer ?? (depth === 1 && name === 'g' && own === undefined ? label : undefined);
      const inner = { ...style, opacity: 1 };
      for (const c of el.children) walk(c, inner, world, lay, depth + 1, hidden, groupOpacity * style.opacity, own ?? group);
      appendClip(own);
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
    if (hasFx(style)) { // effect sizes are in the element's user space: bake the transform scale like the stroke width
      for (const k of FX_KEYS) if (style[k] !== undefined) (st as Record<string, unknown>)[k] = typeof style[k] === 'number' && k !== 'shadowOpacity' ? Math.round((style[k] as number) * scale * 1000) / 1000 : style[k];
    }
    if (groupOpacity !== 1) info('group opacity was multiplied into each child path (overlapping children may differ)');
    const compound = contours.length > 1 ? `c${++compoundC}` : undefined;
    if (typeof st.fill === 'string' && st.fill.startsWith('url(#')) {
      const ref = st.fill.slice(5, -1), resolved = grads.resolve(ref, world, nodesBox(contours));
      if (resolved === null) st.fill = 'none'; else st.fill = `url(#${resolved})`;
    }
    const baseName = label;
    const locked = el.attrs['data-vs-locked'] === '1';
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
      if (clipGroup !== undefined) p.group = clipGroup; else if (group !== undefined) p.group = group;
      if (compound) p.compound = compound;
      if (baseName !== undefined) p.name = baseName;
      if (hidden) p.hidden = true;
      if (locked) p.locked = true;
      paths.push(p);
    }
    appendClip(clipGroup);
  }
  walk(root, { ...DEFAULT_STYLE, dashArray: [] }, base, undefined, 0, false, 1);
  if (strict && diags.some((x) => x.severity === 'error')) {
    throw new SvgImportError(`Unsupported SVG: ${diags.filter((x) => x.severity === 'error').map((x) => x.message).join('; ')}`, diags);
  }
  const doc: VectorDocument = { width: r3(width), height: r3(height), paths };
  if (grads.gradients.length) doc.gradients = grads.gradients;
  const liveGroups = new Set(paths.map((p) => p.group));
  const keptNames = Object.entries(groupNames).filter(([k]) => liveGroups.has(k));
  if (keptNames.length) doc.groupNames = Object.fromEntries(keptNames);
  const gAttr = stripNs(root.name) === 'svg' ? root.attrs['data-vs-guides'] : undefined;
  if (gAttr !== undefined) {
    const g = parseGuides(gAttr);
    if (g === null) info('malformed data-vs-guides ignored');
    else if (g.x.length + g.y.length) doc.guides = g;
  }
  if (texts.length) doc.texts = texts;
  if (images.length) doc.images = images;
  const sAttr = stripNs(root.name) === 'svg' ? root.attrs['data-vs-swatches'] : undefined;
  if (sAttr !== undefined) {
    const sw = parseSwatches(sAttr);
    if (sw === null) info('malformed data-vs-swatches ignored');
    else if (sw.length) doc.swatches = sw;
  }
  return { doc, warnings: diags.filter((x) => x.severity === 'warning') };
}
