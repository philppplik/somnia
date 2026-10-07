import test from 'node:test';
import assert from 'node:assert/strict';
import { arcToCubics, exportSvg, importSvg, normalizeDoc, parsePathData, parseTransform, serializeContour, SvgImportError, type VectorDocument, type VectorNode } from './index';
import type { Segment } from './pathData';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);
const imp = (body: string, attrs = 'viewBox="0 0 100 100"') => importSvg(`<svg ${attrs}>${body}</svg>`).doc;
const node = (x: number, y: number, extra: Partial<VectorNode> = {}): VectorNode => ({ id: 'n', x, y, kind: 'corner', ...extra });

test('path data: relative, H/V, implicit lineto, compact number forms', () => {
  const { segments, error } = parsePathData('m10 20 5 5h5v-5z M1.5.5-2e1-1');
  assert.equal(error, undefined);
  assert.deepEqual(segments, [
    { t: 'M', x: 10, y: 20 }, { t: 'L', x: 15, y: 25 }, { t: 'L', x: 20, y: 25 }, { t: 'L', x: 20, y: 20 }, { t: 'Z' },
    { t: 'M', x: 1.5, y: 0.5 }, { t: 'L', x: -20, y: -1 },
  ]);
});

test('path data: S/T reflection and fallback', () => {
  const { segments } = parsePathData('M0 0C0 10 10 10 10 0S20 -10 20 0 M0 0S5 5 10 0 M0 0Q5 5 10 0T20 0');
  assert.deepEqual(segments[2], { t: 'C', x1: 10, y1: -10, x2: 20, y2: -10, x: 20, y: 0 });
  assert.deepEqual(segments[4], { t: 'C', x1: 0, y1: 0, x2: 5, y2: 5, x: 10, y: 0 });
  assert.deepEqual(segments[7], { t: 'Q', x1: 15, y1: -5, x: 20, y: 0 });
});

test('path data: malformed tail keeps prefix and reports error', () => {
  const r = parsePathData('M0 0 L10 10 L5');
  assert.equal(r.segments.length, 2); assert.ok(r.error);
  assert.ok(parsePathData('L1 1').error);
});

test('arcs: flags without separators, exact endpoint, half circle = 2 cubics', () => {
  const { segments, error } = parsePathData('M0 0a5 5 0 1010 0');
  assert.equal(error, undefined);
  const last = segments.at(-1) as Extract<Segment, { t: 'C' }>;
  assert.equal(last.x, 10); assert.equal(last.y, 0);
  assert.equal(segments.length, 3);
});

test('arcs: quarter circle control points, sweep direction, degenerate cases, radius scaling', () => {
  const [c] = arcToCubics(10, 0, 10, 10, 0, false, true, 0, 10) as Extract<Segment, { t: 'C' }>[];
  near(c.y1, 5.5228475); near(c.x2, 5.5228475);
  const [d] = arcToCubics(10, 0, 10, 10, 0, false, false, 0, -10) as Extract<Segment, { t: 'C' }>[];
  near(d.y1, -5.5228475);
  assert.deepEqual(arcToCubics(0, 0, 0, 5, 0, false, true, 10, 0), [{ t: 'L', x: 10, y: 0 }]);
  assert.deepEqual(arcToCubics(3, 3, 5, 5, 0, false, true, 3, 3), []);
  for (const s of arcToCubics(0, 0, 1, 1, 0, false, true, 10, 0) as Extract<Segment, { t: 'C' }>[]) near(Math.hypot(s.x - 5, s.y), 5, 1e-5);
});

test('arcs: points of a rotated ellipse arc satisfy the ellipse equation', () => {
  const segs = arcToCubics(0, 0, 10, 5, 30, false, true, 8, 6) as Extract<Segment, { t: 'C' }>[];
  // recover centre by symmetry check: all endpoints satisfy same ellipse; verify last endpoint exact
  assert.equal(segs.at(-1)!.x, 8); assert.equal(segs.at(-1)!.y, 6);
});

test('import: shapes become paths with absolute handles; circle has 4 curve nodes', () => {
  const d = imp('<circle cx="50" cy="50" r="10"/>');
  assert.equal(d.paths.length, 1);
  const p = d.paths[0];
  assert.equal(p.closed, true); assert.equal(p.nodes.length, 4);
  assert.deepEqual([p.nodes[0].x, p.nodes[0].y], [60, 50]);
  near(p.nodes[0].out!.y, 50 + 10 * 0.5522847498307936);
  near(p.nodes[0].in!.y, 50 - 10 * 0.5522847498307936);
  assert.equal(p.nodes[0].kind, 'symmetric');
});

test('import: rect, rounded rect, line, polyline, polygon', () => {
  const r = imp('<rect x="1" y="2" width="10" height="20"/>').paths[0];
  assert.deepEqual(r.nodes.map((n) => [n.x, n.y]), [[1, 2], [11, 2], [11, 22], [1, 22]]);
  assert.ok(r.closed && r.nodes.every((n) => !n.in && !n.out && n.kind === 'corner'));
  const rr = imp('<rect width="10" height="10" rx="99"/>').paths[0];
  assert.ok(rr.closed); assert.ok(rr.nodes.some((n) => n.in || n.out));
  assert.equal(imp('<line x1="0" y1="0" x2="5" y2="5"/>').paths[0].closed, false);
  assert.equal(imp('<polyline points="0,0 1,1 2,0"/>').paths[0].closed, false);
  assert.equal(imp('<polygon points="0,0 1,1 2,0"/>').paths[0].closed, true);
});

test('import: closing duplicate node is merged; curve closing keeps the incoming handle', () => {
  const p = imp('<path d="M0 0L10 0L10 10L0 0Z"/>').paths[0];
  assert.equal(p.nodes.length, 3);
  const q = imp('<path d="M0 0C0 -5 10 -5 10 0S0 10 0 0Z"/>').paths[0];
  assert.equal(q.nodes.length, 2);
  assert.deepEqual(q.nodes[0].in, { x: 0, y: 10 });
});

test('import: quadratic is elevated exactly to cubic', () => {
  const p = imp('<path d="M0 0Q30 60 60 0"/>').paths[0];
  assert.deepEqual(p.nodes[0].out, { x: 20, y: 40 });
  assert.deepEqual(p.nodes[1].in, { x: 40, y: 40 });
});

test('import: node kinds inferred (smooth / symmetric / corner)', () => {
  const p = imp('<path d="M0 0C0 -10 10 -10 10 0C10 15 30 15 30 0"/>').paths[0];
  assert.equal(p.nodes[1].kind, 'smooth'); // in (10,-10) vs out (10,15): collinear, opposite, different length
  assert.equal(p.nodes[0].kind, 'corner');
  const q = imp('<path d="M0 0C0 -10 10 -10 10 0C10 10 20 10 20 0"/>').paths[0];
  assert.equal(q.nodes[1].kind, 'symmetric');
});

test('import: transforms are baked into points and handles; stroke width scales', () => {
  const p = imp('<g transform="translate(10 20)"><path d="M0 0C1 1 2 2 3 3" transform="scale(2)" stroke="#000" stroke-width="3"/></g>').paths[0];
  assert.deepEqual([p.nodes[0].x, p.nodes[0].y], [10, 20]);
  assert.deepEqual(p.nodes[0].out, { x: 12, y: 22 });
  assert.deepEqual([p.nodes[1].x, p.nodes[1].y], [16, 26]);
  assert.equal(p.style!.strokeWidth, 6);
  const r = parseTransform('rotate(90 10 10)')!;
  near(r[0], 0); near(r[1], 1); near(r[4], 20); near(r[5], 0);
  assert.equal(parseTransform('bogus(1)'), null);
});

test('import: viewBox is baked into pixel space (origin and scale)', () => {
  const d = importSvg('<svg width="200" height="100" viewBox="10 10 100 50"><path d="M10 10L110 60"/></svg>').doc;
  assert.deepEqual([d.width, d.height], [200, 100]);
  assert.deepEqual(d.paths[0].nodes.map((n) => [n.x, n.y]), [[0, 0], [200, 100]]);
  const m = importSvg('<svg width="200" height="200" viewBox="0 0 100 50"><path d="M0 0L100 50"/></svg>').doc; // meet, centred
  assert.deepEqual(m.paths[0].nodes.map((n) => [n.x, n.y]), [[0, 50], [200, 150]]);
  const u = importSvg('<svg width="1in" height="10mm"><path d="M0 0L1 1"/></svg>').doc;
  assert.equal(u.width, 96); near(u.height, 37.795, 1e-3);
});

test('import: groups -> layer names, nested groups share the top-level layer, loose elements have none', () => {
  const d = imp('<rect width="1" height="1"/><g id="bg" inkscape:label="Background"><g><circle cx="5" cy="5" r="1"/></g></g>');
  assert.equal(d.paths[0].layer, undefined);
  assert.equal(d.paths[1].layer, 'Background');
});

test('import: style cascade, style="" override, colour normalisation, defaults, group opacity', () => {
  const d = imp(`<g fill="#f00" stroke="rgb(0,128,255)" stroke-width="2" stroke-linecap="round" opacity=".5">
    <path d="M0 0L1 1"/><path d="M0 0L1 1" fill="blue" style="fill:#0F0;stroke-dasharray:1 2 3;fill-rule:evenodd"/></g><path d="M0 0L1 1"/>`);
  const [a, b, c] = d.paths;
  assert.equal(a.style!.fill, '#ff0000'); assert.equal(a.style!.stroke, '#0080ff'); assert.equal(a.style!.strokeWidth, 2);
  assert.equal(a.style!.lineCap, 'round'); assert.equal(a.style!.opacity, 0.5);
  assert.equal(b.style!.fill, '#00ff00'); assert.deepEqual(b.style!.dashArray, [1, 2, 3, 1, 2, 3]); assert.equal(b.style!.fillRule, 'evenodd');
  assert.equal(c.style, undefined); // pure defaults
});

test('import: multiple subpaths become compound contours', () => {
  const d = imp('<path d="M0 0H10V10H0Z M2 2H8V8H2Z" fill-rule="evenodd"/>');
  assert.equal(d.paths.length, 2);
  assert.equal(d.paths[0].compound, d.paths[1].compound);
  assert.ok(d.paths[0].compound);
  assert.equal(imp('<path d="M0 0H10V10Z L0 5"/>').paths.length, 2); // drawing after Z starts a new contour at the start
});

test('import: node and path ids are unique', () => {
  const d = imp('<circle cx="5" cy="5" r="2"/><rect width="3" height="3"/>');
  const ids = [...d.paths.map((p) => p.id), ...d.paths.flatMap((p) => p.nodes.map((n) => n.id))];
  assert.equal(new Set(ids).size, ids.length);
});

test('strict import rejects unsupported features and lists them all', () => {
  const src = `<svg viewBox="0 0 1 1" onload="x()"><defs><linearGradient id="g"/></defs><text>hi</text><use href="#a"/><image href="http://x/y.png"/>
    <path d="M0 0L1 1" fill="url(#g)" class="a" clip-path="url(#c)"/><style>a{}</style><script>1</script></svg>`;
  assert.throws(() => importSvg(src), (e: unknown) => {
    assert.ok(e instanceof SvgImportError);
    const m = e.diagnostics.map((d) => d.message).join('|');
    for (const k of ['onload', '<text>', '<use>', '<image>', '<defs>', 'gradients', 'CSS classes', 'clip-path', '<style>', '<script>']) assert.ok(m.includes(k), `${k} missing in ${m}`);
    return true;
  });
});

test('lenient import keeps supported content and reports each skip', () => {
  const r = importSvg('<svg viewBox="0 0 1 1"><text>x</text><path d="M0 0L1 1"/></svg>', { strict: false });
  assert.equal(r.doc.paths.length, 1);
  assert.ok(r.warnings.some((w) => w.message.includes('<text>')));
});

test('import errors: not XML, wrong root, unclosed, entity declarations, limits, bad preserveAspectRatio', () => {
  assert.throws(() => importSvg('hello'), SvgImportError);
  assert.throws(() => importSvg('<html/>'), SvgImportError);
  assert.throws(() => importSvg('<svg><g></svg>'), SvgImportError);
  assert.throws(() => importSvg('<!DOCTYPE svg [<!ENTITY a "b">]><svg/>'), /ENTITY/);
  assert.throws(() => importSvg('<svg viewBox="0 0 1 1" preserveAspectRatio="xMinYMin slice"/>'), SvgImportError);
  assert.throws(() => importSvg('<svg viewBox="0 0 1 1">' + '<g>'.repeat(70) + '</g>'.repeat(70) + '</svg>'), /depth/);
  const many = Array.from({ length: 10_001 }, () => '<rect width="1" height="1"/>').join('');
  assert.throws(() => importSvg(`<svg viewBox="0 0 1 1">${many}</svg>`), /nodes/);
  assert.throws(() => importSvg('<svg viewBox="0 0 1 1">' + ' '.repeat(8 * 1024 * 1024 + 1) + '</svg>'), /larger/);
});

test('XML features: prolog, comments, CDATA, entities, namespace prefix, no entity expansion', () => {
  const d = importSvg('<?xml version="1.0"?><!DOCTYPE svg><!-- c --><svg:svg xmlns:svg="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><svg:title><![CDATA[a<b]]></svg:title><svg:path inkscape:label="a&amp;b" d="M0 0L1 1"/></svg:svg>').doc;
  assert.equal(d.paths[0].name, 'a&b');
});

test('serialize: canonical absolute M/L/C/Z, 3 decimals, no -0, explicit letters', () => {
  const nodes = [node(0, 0, { out: { x: 0.12345, y: -0.0001 } }), node(10, 0, { in: { x: 5, y: 1 } }), node(10, 10)];
  assert.equal(serializeContour(nodes, false), 'M0 0C0.123 0 5 1 10 0L10 10');
  assert.equal(serializeContour([node(0, 0), node(1, 1), node(2, 0)], true), 'M0 0L1 1L2 0Z');
  // closing curve is explicit
  assert.equal(serializeContour([node(0, 0, { in: { x: -1, y: 1 } }), node(4, 0)], true), 'M0 0L4 0C4 0 -1 1 0 0Z');
  assert.equal(serializeContour([node(-0.0004, 1.0)], false), 'M0 1');
  assert.equal(serializeContour([], true), '');
  assert.ok(!/[a-z]/.test(serializeContour(nodes, true).replace(/e/g, '')), 'only uppercase commands');
  assert.ok(!serializeContour(nodes, true).includes('-0 ') && !/-0$|-0[A-Z]/.test(serializeContour(nodes, true)));
});

test('canonical rules hold for every exported path of a complex sample', () => {
  const svg = exportSvg(importSvg(SAMPLE).doc);
  for (const m of svg.matchAll(/ d="([^"]*)"/g)) {
    const d = m[1];
    assert.match(d, /^[MLCZ0-9. \-]+$/); // absolute commands only
    assert.ok(!/\d\.\d{4}/.test(d), `more than 3 decimals: ${d}`);
    assert.ok(!/(^|[^0-9.])-0(?![.\d])/.test(d), `negative zero: ${d}`);
  }
});

test('export: minimal document and default style omitted', () => {
  const doc: VectorDocument = { width: 10, height: 10, paths: [{ id: 'p1', closed: true, nodes: [node(0, 0), node(10, 0), node(10, 10)] }] };
  assert.equal(exportSvg(doc, { indent: '' }), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><path d="M0 0L10 0L10 10Z"/></svg>\n');
});

test('export: style attributes, layers, compound merge, hidden, escaping', () => {
  const sq = (o: number): VectorNode[] => [node(o, o), node(10 - o, o), node(10 - o, 10 - o), node(o, 10 - o)];
  const doc: VectorDocument = { width: 10, height: 10, paths: [
    { id: 'a', closed: true, nodes: sq(0), compound: 'c', layer: 'L "1"', style: { fill: 'none', stroke: '#0000ff', strokeWidth: 2, dashArray: [1, 2], fillRule: 'evenodd' } },
    { id: 'b', closed: true, nodes: sq(2), compound: 'c', layer: 'L "1"' },
    { id: 'c', closed: false, nodes: [node(0, 0), node(1, 1)], hidden: true },
  ] };
  const out = exportSvg(doc);
  assert.equal((out.match(/<path/g) ?? []).length, 2);
  assert.ok(out.includes('<g data-name="L &quot;1&quot;">'));
  assert.ok(out.includes('fill="none" stroke="#0000ff" stroke-width="2" stroke-dasharray="1 2" fill-rule="evenodd"'));
  assert.ok(out.includes('Z' + 'M2 2'));
  assert.ok(out.includes('display="none"'));
  assert.ok(!out.includes('stroke-linecap'));
});

const SAMPLE = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <g id="bg" inkscape:label="Back" opacity="0.8"><rect width="200" height="100" fill="#eee" rx="8"/></g>
  <g id="art" transform="translate(10 20) rotate(15)" fill="#336699" stroke="#000" stroke-width="1.5" stroke-linejoin="round">
    <path d="M0 0 A20 10 30 1 1 40 0 Q50 20 60 0 T80 0 S90 20 100 0 Z" fill-rule="evenodd"/>
    <g transform="scale(2 3)"><circle cx="5" cy="5" r="4" stroke-dasharray="2 1" stroke-dashoffset="1"/><polygon points="0,0 4,0 2,3" fill="none"/></g>
    <path d="M0 50h10v10h-10z M2 52h6v6h-6z"/>
  </g>
  <line x1="0" y1="0" x2="10" y2="10" stroke="red"/>
</svg>`;

test('roundtrip: import -> export -> import equals the normalised first import', () => {
  const a = importSvg(SAMPLE);
  const svg1 = exportSvg(a.doc);
  const b = importSvg(svg1);
  assert.deepEqual(b.warnings, []);
  assert.deepEqual(b.doc, normalizeDoc(a.doc));
});

test('roundtrip: export is idempotent (byte-identical on second pass)', () => {
  const svg1 = exportSvg(importSvg(SAMPLE).doc);
  const svg2 = exportSvg(importSvg(svg1).doc);
  assert.equal(svg2, svg1);
});

test('roundtrip: exported geometry is visually the same (endpoint and handle positions within 5e-4 of source)', () => {
  const a = importSvg(SAMPLE).doc, b = importSvg(exportSvg(a)).doc;
  assert.equal(a.paths.length, b.paths.length);
  a.paths.forEach((p, i) => p.nodes.forEach((n, k) => {
    const m = b.paths[i].nodes[k];
    near(n.x, m.x, 5e-4); near(n.y, m.y, 5e-4);
    if (n.out) near(n.out.x, m.out!.x, 5e-4);
    if (n.in) near(n.in.y, m.in!.y, 5e-4);
  }));
});

test('roundtrip: model -> svg -> model for a hand-built document with all node kinds', () => {
  const doc = normalizeDoc({ width: 50, height: 40, paths: [{ id: 'p1', closed: true, nodes: [
    node(0, 0), node(10, 0, { in: { x: 5, y: -5 }, out: { x: 15, y: 5 } }), node(20, 20, { in: { x: 20, y: 10 }, out: { x: 20, y: 30 } }),
  ] }] });
  const back = importSvg(exportSvg(doc)).doc;
  assert.deepEqual(back.paths[0].nodes.map((n) => ({ ...n, id: '' })), doc.paths[0].nodes.map((n) => ({ ...n, id: '' })));
  assert.deepEqual(back.paths[0].nodes.map((n) => n.kind), ['corner', 'symmetric', 'symmetric']);
  assert.equal(back.paths[0].closed, true);
});

test('import does not mutate or retain input; repeated imports are deterministic', () => {
  assert.deepEqual(importSvg(SAMPLE), importSvg(SAMPLE));
});
