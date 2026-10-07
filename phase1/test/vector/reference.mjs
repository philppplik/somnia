// Independent reference math for vector conformance tests.
// Deliberately does NOT import anything from src/. Pure JS, no dependencies.
// Two independent evaluators (Bernstein, de Casteljau) cross-check each other.

export const KAPPA = 0.5522847498307936; // 4/3*(sqrt(2)-1)

export function bernstein(c, t) {
  const u = 1 - t;
  const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
  return { x: b0 * c[0].x + b1 * c[1].x + b2 * c[2].x + b3 * c[3].x, y: b0 * c[0].y + b1 * c[1].y + b2 * c[2].y + b3 * c[3].y };
}

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function casteljau(c, t) {
  const a = lerp(c[0], c[1], t), b = lerp(c[1], c[2], t), d = lerp(c[2], c[3], t);
  const e = lerp(a, b, t), f = lerp(b, d, t);
  return lerp(e, f, t);
}

export function split(c, t) {
  const a = lerp(c[0], c[1], t), b = lerp(c[1], c[2], t), d = lerp(c[2], c[3], t);
  const e = lerp(a, b, t), f = lerp(b, d, t), m = lerp(e, f, t);
  return [[c[0], a, e, m], [m, f, d, c[3]]];
}

// Roots of the derivative per axis (quadratic), in (0,1).
function extremaT(p0, p1, p2, p3) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0; // B'(t)/3 = a t^2 + b t + c
  const ts = [];
  if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) ts.push(-c / b); }
  else { const D = b * b - 4 * a * c; if (D >= 0) { const s = Math.sqrt(D); ts.push((-b + s) / (2 * a), (-b - s) / (2 * a)); } }
  return ts.filter((t) => t > 0 && t < 1);
}

export function bbox(c) {
  const ts = [0, 1, ...extremaT(c[0].x, c[1].x, c[2].x, c[3].x), ...extremaT(c[0].y, c[1].y, c[2].y, c[3].y)];
  const pts = ts.map((t) => bernstein(c, t));
  return { minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)) };
}

// Arc length by 5-point... plain high-resolution polyline (n = 20000); error ~1e-9 for smooth curves.
export function length(c, n = 20000) {
  let len = 0, prev = c[0];
  for (let i = 1; i <= n; i++) { const p = bernstein(c, i / n); len += Math.hypot(p.x - prev.x, p.y - prev.y); prev = p; }
  return len;
}

// Canonical number format of the vector contract: max 3 decimals, trailing zeros trimmed, no "-0".
export function fmt(n) {
  let s = (Math.round(n * 1000) / 1000).toFixed(3).replace(/\.?0+$/, '');
  if (s === '-0' || s === '') s = '0';
  return s;
}

// Canonical path serialization. Nodes: {x,y,in:{x,y}|null,out:{x,y}|null} with ABSOLUTE handles.
export function serializePath(path) {
  const n = path.nodes;
  if (n.length === 0) return '';
  const seg = (a, b) => {
    if (!a.out && !b.in) return `L${fmt(b.x)} ${fmt(b.y)}`;
    const o = a.out ?? { x: a.x, y: a.y }, i = b.in ?? { x: b.x, y: b.y };
    return `C${fmt(o.x)} ${fmt(o.y)} ${fmt(i.x)} ${fmt(i.y)} ${fmt(b.x)} ${fmt(b.y)}`;
  };
  let d = `M${fmt(n[0].x)} ${fmt(n[0].y)}`;
  for (let k = 1; k < n.length; k++) d += seg(n[k - 1], n[k]);
  if (path.closed) {
    const last = n[n.length - 1], first = n[0];
    if (last.out || first.in) d += seg(last, first);
    d += 'Z';
  }
  return d;
}

// Parser for the canonical subset (M, L, C, Z absolute). Inverse of serializePath.
export function parsePath(d) {
  const re = /([MLCZ])([^MLCZ]*)/g; const nodes = []; let closed = false, m;
  while ((m = re.exec(d))) {
    const nums = m[2].trim() ? m[2].trim().split(/[ ,]+/).map(Number) : [];
    if (m[1] === 'M' || m[1] === 'L') nodes.push({ x: nums[0], y: nums[1], in: null, out: null });
    else if (m[1] === 'C') {
      nodes[nodes.length - 1].out = { x: nums[0], y: nums[1] };
      nodes.push({ x: nums[4], y: nums[5], in: { x: nums[2], y: nums[3] }, out: null });
    } else closed = true;
  }
  if (closed && nodes.length > 1) {
    const f = nodes[0], l = nodes[nodes.length - 1];
    if (l.x === f.x && l.y === f.y && l.in) { f.in = l.in; nodes.pop(); } // closing curve returns to first node
  }
  return { closed, nodes };
}
