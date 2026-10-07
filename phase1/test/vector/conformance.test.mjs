// Vector conformance suite. Run: node --test phase1/test/vector/*.test.mjs
// Part 1 (always runs): reference math vs hand-derived fixtures vs independent recomputation.
// Part 2 (runs only if SOMNIA_VECTORCORE is set to a module path): the implementation must match the reference.
//   Required exports: serializePath(path), parsePath(d), pointAt(c,t), splitCubic(c,t), cubicBBox(c), cubicLength(c)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as ref from './reference.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
const near = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);
const nearPt = (p, q, eps = 1e-9, msg = '') => { near(p.x, q.x, eps, msg + ' x'); near(p.y, q.y, eps, msg + ' y'); };

test('reference: fixtures match both evaluators', () => {
  for (const f of fx.curves) for (const p of f.points) {
    nearPt(ref.bernstein(f.c, p.t), p, 1e-12, `${f.name} bernstein t=${p.t}`);
    nearPt(ref.casteljau(f.c, p.t), p, 1e-12, `${f.name} casteljau t=${p.t}`);
  }
});

test('reference: evaluators agree on a dense grid', () => {
  const c = [{x:3,y:-2},{x:-7,y:11},{x:19,y:4},{x:8,y:-9}];
  for (let i = 0; i <= 100; i++) nearPt(ref.bernstein(c, i / 100), ref.casteljau(c, i / 100), 1e-10);
});

test('reference: bbox fixtures and bbox contains all samples', () => {
  for (const f of fx.curves.filter((x) => x.bbox)) {
    const b = ref.bbox(f.c);
    for (const k of ['minX', 'minY', 'maxX', 'maxY']) near(b[k], f.bbox[k], 1e-9, `${f.name} ${k}`);
  }
  const c = [{x:3,y:-2},{x:-7,y:11},{x:19,y:4},{x:8,y:-9}], b = ref.bbox(c);
  for (let i = 0; i <= 2000; i++) { const p = ref.bernstein(c, i / 2000); assert.ok(p.x >= b.minX - 1e-9 && p.x <= b.maxX + 1e-9 && p.y >= b.minY - 1e-9 && p.y <= b.maxY + 1e-9); }
});

test('reference: split preserves the curve', () => {
  const c = fx.curves[1].c;
  for (const t of [0.1, 0.5, 0.9]) {
    const [l, r] = ref.split(c, t);
    nearPt(l[3], ref.bernstein(c, t)); nearPt(r[0], l[3]);
    for (const s of [0, 0.3, 1]) { nearPt(ref.bernstein(l, s), ref.bernstein(c, t * s), 1e-10); nearPt(ref.bernstein(r, s), ref.bernstein(c, t + (1 - t) * s), 1e-10); }
  }
});

test('reference: lengths (straight line exact, circle quarter within kappa error)', () => {
  near(ref.length(fx.curves[2].c), fx.curves[2].length, 1e-9);
  const k = ref.KAPPA, q = [{x:1,y:0},{x:1,y:k},{x:k,y:1},{x:0,y:1}];
  near(ref.length(q), Math.PI / 2, 3e-4, 'quarter circle');   // known kappa approximation error ~2.7e-4 relative
  for (let i = 0; i <= 50; i++) { const p = ref.bernstein(q, i / 50); near(Math.hypot(p.x, p.y), 1, 3e-4, 'radius'); }
});

test('reference: number formatting', () => { for (const [n, s] of fx.fmt) assert.equal(ref.fmt(n), s, String(n)); });

test('reference: path serialization fixtures', () => { for (const f of fx.paths) assert.equal(ref.serializePath(f.path), f.d, f.name); });

test('reference: parse(serialize(p)) is a fixed point', () => {
  for (const f of fx.paths.filter((x) => x.d && !x.name.startsWith('rounding'))) {
    const again = ref.serializePath(ref.parsePath(f.d));
    assert.equal(again, f.d, f.name);
  }
});

const implPath = process.env.SOMNIA_VECTORCORE;
const impl = implPath ? await import(pathToFileURL(implPath).href) : null;
const skip = impl ? false : 'SOMNIA_VECTORCORE not set (vectorcore not integrated yet)';

test('impl: serializePath matches fixtures byte for byte', { skip }, () => { for (const f of fx.paths) assert.equal(impl.serializePath(f.path), f.d, f.name); });
test('impl: parsePath round-trips canonical strings', { skip }, () => {
  for (const f of fx.paths.filter((x) => x.d && !x.name.startsWith('rounding'))) assert.equal(impl.serializePath(impl.parsePath(f.d)), f.d, f.name);
});
test('impl: pointAt/split/bbox/length match reference', { skip }, () => {
  for (const f of fx.curves) {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) nearPt(impl.pointAt(f.c, t), ref.bernstein(f.c, t), 1e-9, `${f.name} t=${t}`);
    const [l, r] = impl.splitCubic(f.c, 0.3), [el, er] = ref.split(f.c, 0.3);
    for (let i = 0; i < 4; i++) { nearPt(l[i], el[i], 1e-9); nearPt(r[i], er[i], 1e-9); }
    const b = impl.cubicBBox(f.c), eb = ref.bbox(f.c);
    for (const k of ['minX', 'minY', 'maxX', 'maxY']) near(b[k], eb[k], 1e-6, `${f.name} ${k}`);
    near(impl.cubicLength(f.c), ref.length(f.c), 1e-4, `${f.name} length`);
  }
});
