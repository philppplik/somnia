/**
 * CSP parsing and conformance checks for the somnia-ext:// scheme model.
 * Pure functions, no DOM. Used by unit tests, the Playwright harness and the native self-test.
 * The expected policies mirror docs: worker = script-src 'unsafe-eval' + connect-src 'none';
 * panel = default-src 'none' + script-src 'unsafe-inline' + form-action 'none' + base-uri 'none'.
 */
export type CspMap = Map<string, string[]>;
export const FETCH_DIRECTIVES = ['child-src', 'connect-src', 'font-src', 'frame-src', 'img-src', 'manifest-src', 'media-src', 'object-src', 'script-src', 'style-src', 'worker-src'] as const;

export function parseCsp(header: string): CspMap {
  const out: CspMap = new Map();
  for (const part of header.split(';')) {
    const toks = part.trim().split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    const name = toks[0]!.toLowerCase();
    if (out.has(name)) continue; // first occurrence wins, per spec
    out.set(name, toks.slice(1));
  }
  return out;
}

/** Effective source list of a fetch directive (falls back to default-src). undefined = unrestricted. */
export function effective(csp: CspMap, directive: string): string[] | undefined {
  const own = csp.get(directive);
  if (own) return own;
  if ((FETCH_DIRECTIVES as readonly string[]).includes(directive)) return csp.get('default-src');
  return undefined;
}

const isNone = (l: string[] | undefined) => !!l && l.length === 1 && l[0]!.toLowerCase() === "'none'";
const bad = (s: string) => /^(\*|https?:|wss?:|ftp:|blob:|filesystem:|https?:\/\/|\*\.)/i.test(s) || s.includes('*');

export function checkWorkerCsp(header: string): string[] {
  const c = parseCsp(header), v: string[] = [];
  if (!isNone(effective(c, 'connect-src'))) v.push("connect-src must be 'none'");
  const s = effective(c, 'script-src');
  if (!s || !s.includes("'unsafe-eval'")) v.push("script-src must include 'unsafe-eval' (the bootstrap uses AsyncFunction)");
  if (s?.includes("'unsafe-inline'")) v.push("script-src must not include 'unsafe-inline'");
  for (const d of FETCH_DIRECTIVES) for (const src of effective(c, d) ?? ['*']) if (bad(src)) v.push(`${d} allows ${src}`);
  if (!c.has('default-src')) for (const d of ['connect-src', 'script-src']) if (!c.has(d)) v.push(`${d} missing and no default-src`);
  return v;
}

export function checkPanelCsp(header: string): string[] {
  const c = parseCsp(header), v: string[] = [];
  if (!isNone(c.get('default-src'))) v.push("default-src must be 'none'");
  const s = effective(c, 'script-src');
  if (!s || !s.includes("'unsafe-inline'")) v.push("script-src must include 'unsafe-inline' (bridge + panel script)");
  if (s?.includes("'unsafe-eval'")) v.push("script-src must not include 'unsafe-eval'");
  if (!isNone(c.get('form-action'))) v.push("form-action must be 'none'");
  if (!isNone(c.get('base-uri'))) v.push("base-uri must be 'none'");
  for (const d of ['connect-src', 'frame-src', 'object-src', 'worker-src', 'child-src', 'media-src', 'manifest-src'])
    if (!isNone(effective(c, d))) v.push(`${d} must be 'none'`);
  for (const d of FETCH_DIRECTIVES) for (const src of effective(c, d) ?? ['*']) if (bad(src)) v.push(`${d} allows ${src}`);
  return v;
}

/** Host (prod) CSP must let the app start the scheme-served worker and embed the scheme-served panel. */
export function checkHostCsp(header: string, scheme = 'somnia-ext:'): string[] {
  const c = parseCsp(header), v: string[] = [];
  for (const d of ['worker-src', 'frame-src']) {
    const l = effective(c, d) ?? [];
    if (!l.includes(scheme)) v.push(`${d} must allow ${scheme}`);
  }
  const conn = effective(c, 'connect-src') ?? [];
  if (conn.includes('*') || conn.includes('http:') || conn.includes('https:')) v.push('connect-src too broad');
  for (const d of ['script-src', 'worker-src', 'frame-src', 'default-src']) if ((c.get(d) ?? []).includes("'unsafe-eval'")) v.push(`${d} of the host must not get 'unsafe-eval'`);
  if (!isNone(c.get('object-src'))) v.push("object-src must stay 'none'");
  return v;
}

export const REFERENCE_WORKER_CSP = "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'";
export const REFERENCE_PANEL_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";
