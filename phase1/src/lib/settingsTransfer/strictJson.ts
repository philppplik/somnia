/**
 * Strict JSON reader for untrusted setup files. Rejects what JSON.parse silently accepts or cannot bound:
 * duplicate keys, `__proto__`/`constructor`/`prototype` keys, control characters, lone surrogates, excessive depth
 * or entry counts. Objects come back with a null prototype. No eval, no reviver, no network.
 */
export interface JsonLimits { readonly maxBytes: number; readonly maxDepth: number; readonly maxEntries: number }
export const SETUP_LIMITS: JsonLimits = Object.freeze({ maxBytes: 1024 * 1024, maxDepth: 16, maxEntries: 10_000 });
export type StrictResult = { ok: true; value: unknown } | { ok: false; error: string };
const DANGEROUS = new Set(['__proto__', 'prototype', 'constructor']);

export const byteLength = (text: string): number => new TextEncoder().encode(text).length;

export function parseStrictJson(text: string, limits: JsonLimits = SETUP_LIMITS): StrictResult {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, error: 'File is empty' };
  if (byteLength(text) > limits.maxBytes) return { ok: false, error: 'File is too large' };
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let i = 0, entries = 0;
  const fail = (m: string): never => { throw new Error(m); };
  const ws = () => { while (i < text.length && (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t')) i++; };
  const str = (): string => {
    i++; let out = '';
    for (;;) {
      if (i >= text.length) fail('Unterminated string');
      const c = text.charCodeAt(i);
      if (c === 0x22) { i++; return out; }
      if (c < 0x20) fail('Control character in string');
      if (c >= 0xd800 && c <= 0xdbff) { const n = text.charCodeAt(i + 1); if (!(n >= 0xdc00 && n <= 0xdfff)) fail('Invalid Unicode'); out += text[i] + text[i + 1]; i += 2; continue; }
      if (c >= 0xdc00 && c <= 0xdfff) fail('Invalid Unicode');
      if (c === 0x5c) {
        const e = text[i + 1]; i += 2;
        const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (e in map) { out += map[e]; continue; }
        if (e === 'u') {
          const h = text.slice(i, i + 4); if (!/^[0-9a-fA-F]{4}$/.test(h)) fail('Bad escape');
          const u = parseInt(h, 16); i += 4;
          if (u === 0) fail('NUL in string');
          if (u >= 0xd800 && u <= 0xdbff) { if (text[i] === '\\' && text[i + 1] === 'u' && /^[dD][c-fC-F][0-9a-fA-F]{2}$/.test(text.slice(i + 2, i + 6))) { out += String.fromCharCode(u, parseInt(text.slice(i + 2, i + 6), 16)); i += 6; continue; } fail('Invalid Unicode'); }
          if (u >= 0xdc00 && u <= 0xdfff) fail('Invalid Unicode');
          out += String.fromCharCode(u); continue;
        }
        fail('Bad escape');
      }
      out += text[i++];
    }
  };
  const val = (depth: number): unknown => {
    if (depth > limits.maxDepth) fail('Nested too deeply');
    ws();
    const c = text[i];
    if (c === '{') {
      i++; const o = Object.create(null) as Record<string, unknown>; ws();
      if (text[i] === '}') { i++; return o; }
      for (;;) {
        ws(); if (text[i] !== '"') fail('Expected key');
        const k = str();
        if (DANGEROUS.has(k)) fail('Forbidden key');
        if (k in o) fail('Duplicate key');
        if (++entries > limits.maxEntries) fail('Too many entries');
        ws(); if (text[i++] !== ':') fail('Expected colon');
        o[k] = val(depth + 1); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return o; }
        fail('Expected , or }');
      }
    }
    if (c === '[') {
      i++; const a: unknown[] = []; ws();
      if (text[i] === ']') { i++; return a; }
      for (;;) {
        if (++entries > limits.maxEntries) fail('Too many entries');
        a.push(val(depth + 1)); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return a; }
        fail('Expected , or ]');
      }
    }
    if (c === '"') return str();
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i, i + 64));
    if (m) { i += m[0].length; const n = Number(m[0]); if (!Number.isFinite(n)) fail('Bad number'); return n; }
    for (const [w, v] of [['true', true], ['false', false], ['null', null]] as const) if (text.startsWith(w, i)) { i += w.length; return v; }
    return fail('Unexpected token');
  };
  try {
    const v = val(0); ws();
    if (i < text.length) return { ok: false, error: 'Unexpected content after JSON' };
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
}
