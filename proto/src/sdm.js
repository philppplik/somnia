// Somnia Document Model (SDM) - Phase 0
// The model is a real DOM Document. Paths are child-index arrays from <body>.
const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);
const INLINE = new Set(['a','abbr','b','bdi','bdo','br','cite','code','data','dfn','em','i','kbd','mark','q','s','samp','small','span','strong','sub','sup','time','u','var','wbr','img','label','button','svg','input','select','textarea']);
const RAW = new Set(['script','style','pre','textarea']);

export const isVoid = (el) => VOID.has(el.localName);

export function parse(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function openTag(el) {
  let s = '<' + el.localName;
  for (const a of el.attributes) {
    s += a.value === '' && /^(disabled|checked|hidden|defer|async|required|selected|readonly|autofocus|controls|muted|loop|autoplay|open)$/.test(a.name)
      ? ' ' + a.name : ` ${a.name}="${escAttr(a.value)}"`;
  }
  return s + '>';
}

function isInlineOnly(el) {
  for (const c of el.childNodes) {
    if (c.nodeType === 1 && !INLINE.has(c.localName)) return false;
    if (c.nodeType === 8) return false;
  }
  return true;
}

function inlineHTML(el) {
  let out = '';
  for (const c of el.childNodes) {
    if (c.nodeType === 3) out += escText(c.nodeValue.replace(/\s+/g, ' '));
    else if (c.nodeType === 1) out += elementHTMLInline(c);
  }
  return out;
}
function elementHTMLInline(el) {
  if (RAW.has(el.localName)) return openTag(el) + el.innerHTML + `</${el.localName}>`;
  if (VOID.has(el.localName)) return openTag(el);
  return openTag(el) + inlineHTML(el) + `</${el.localName}>`;
}

function writeNode(node, depth, out) {
  const pad = '  '.repeat(depth);
  if (node.nodeType === 3) {
    const t = node.nodeValue.replace(/\s+/g, ' ').trim();
    if (t) out.push(pad + escText(t));
    return;
  }
  if (node.nodeType === 8) { out.push(pad + '<!--' + node.nodeValue + '-->'); return; }
  if (node.nodeType !== 1) return;
  const el = node, n = el.localName;
  if (VOID.has(n)) { out.push(pad + openTag(el)); return; }
  if (RAW.has(n)) {
    if (n === 'pre' || n === 'textarea') { out.push(pad + openTag(el) + el.innerHTML + `</${n}>`); return; }
    const body = el.textContent.replace(/^\n+|\s+$/g, '');
    if (!body) { out.push(pad + openTag(el) + `</${n}>`); return; }
    const lines = body.split('\n');
    const min = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
    out.push(pad + openTag(el));
    for (const l of lines) out.push(l.trim() ? pad + '  ' + l.slice(min) : '');
    out.push(pad + `</${n}>`);
    return;
  }
  if (n === 'svg') { out.push(pad + openTag(el) + el.innerHTML + '</svg>'); return; }
  if (!el.childNodes.length) { out.push(pad + openTag(el) + `</${n}>`); return; }
  if (isInlineOnly(el)) {
    const inner = inlineHTML(el).trim();
    const line = pad + openTag(el) + inner + `</${n}>`;
    if (line.length <= 110 || INLINE.has(n)) { out.push(line); return; }
  }
  out.push(pad + openTag(el));
  for (const c of el.childNodes) writeNode(c, depth + 1, out);
  out.push(pad + `</${n}>`);
}

export function serialize(doc) {
  const out = ['<!DOCTYPE html>'];
  const html = doc.documentElement;
  out.push(openTag(html));
  for (const part of [doc.head, doc.body]) {
    out.push('  ' + openTag(part));
    for (const c of part.childNodes) writeNode(c, 2, out);
    out.push(`  </${part.localName}>`);
  }
  out.push('</html>');
  return out.join('\n') + '\n';
}

export function pathOf(el, body) {
  const p = [];
  while (el && el !== body) {
    const parent = el.parentElement;
    if (!parent) return null;
    p.unshift(Array.prototype.indexOf.call(parent.children, el));
    el = parent;
  }
  return el === body ? p : null;
}
export function byPath(body, path) {
  let el = body;
  for (const i of path) { el = el && el.children[i]; }
  return el || null;
}
export function samePath(a, b) { return a && b && a.length === b.length && a.every((v, i) => v === b[i]); }
export function isAncestorPath(a, b) { return a.length < b.length && a.every((v, i) => v === b[i]); }

// Inline style handling that keeps the author's value strings (CSSOM would turn #hex into rgb()).
export function parseStyle(attr) {
  const out = []; let cur = '', depth = 0, q = '';
  const flush = () => { const i = cur.indexOf(':'); if (i > 0) out.push([cur.slice(0, i).trim().toLowerCase(), cur.slice(i + 1).trim()]); cur = ''; };
  for (const ch of attr || '') {
    if (q) { cur += ch; if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(') depth++; if (ch === ')') depth--;
    if (ch === ';' && depth <= 0) { flush(); continue; }
    cur += ch;
  }
  flush(); return out;
}
export function getInline(el, prop) { const e = parseStyle(el.getAttribute('style')).find(([k]) => k === prop); return e ? e[1] : ''; }
export function setInline(el, props) {
  const list = parseStyle(el.getAttribute('style'));
  for (const [k, v] of Object.entries(props)) {
    const i = list.findIndex(([n]) => n === k);
    if (v === '' || v == null) { if (i >= 0) list.splice(i, 1); } else if (i >= 0) list[i][1] = v; else list.push([k, v]);
  }
  if (list.length) el.setAttribute('style', list.map(([k, v]) => `${k}: ${v}`).join('; ') + ';'); else el.removeAttribute('style');
}

// Responsive overrides: per-breakpoint rules in <style id="somnia-responsive">, keyed by a generated class.
export const BP = { tablet: 900, mobile: 600 };
const RID = 'somnia-responsive';
function readResponsive(doc) {
  const st = doc.getElementById(RID); const out = { tablet: {}, mobile: {} };
  if (!st) return out;
  const re = /@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g; let m;
  while ((m = re.exec(st.textContent))) {
    const key = +m[1] === BP.mobile ? 'mobile' : 'tablet';
    const rr = /\.([\w-]+)\s*\{([^}]*)\}/g; let r;
    while ((r = rr.exec(m[2]))) out[key][r[1]] = parseStyle(r[2]).map(([k, v]) => [k, v.replace(/\s*!important$/, '')]);
  }
  return out;
}
function writeResponsive(doc, data) {
  let st = doc.getElementById(RID);
  const blocks = [];
  for (const key of ['tablet', 'mobile']) {
    const rules = Object.entries(data[key]).filter(([, l]) => l.length);
    if (!rules.length) continue;
    blocks.push(`@media (max-width: ${BP[key]}px) {\n` + rules.map(([c, l]) => `  .${c} { ${l.map(([k, v]) => `${k}: ${v} !important`).join('; ')}; }`).join('\n') + '\n}');
  }
  if (!blocks.length) { if (st) st.remove(); return; }
  if (!st) { st = doc.createElement('style'); st.id = RID; doc.head.appendChild(st); }
  st.textContent = '\n/* Somnia: per-breakpoint overrides */\n' + blocks.join('\n') + '\n';
}
const smClass = (el) => [...el.classList].find((c) => /^sm-[0-9a-f]{4,}$/.test(c));
export function getResponsive(doc, el, key) {
  const c = smClass(el); if (!c) return '';
  return (readResponsive(doc)[key][c] || []);
}
export function responsiveValue(doc, el, key, prop) {
  const l = getResponsive(doc, el, key); const e = l && l.find(([k]) => k === prop); return e ? e[1] : '';
}
export function setResponsive(doc, el, key, props) {
  const data = readResponsive(doc); let c = smClass(el);
  if (!c) { c = 'sm-' + Math.random().toString(16).slice(2, 6); el.classList.add(c); }
  const list = data[key][c] || (data[key][c] = []);
  for (const [k, v] of Object.entries(props)) {
    const i = list.findIndex(([n]) => n === k);
    if (v === '' || v == null) { if (i >= 0) list.splice(i, 1); } else if (i >= 0) list[i][1] = v; else list.push([k, v]);
  }
  writeResponsive(doc, data);
  if (!(data.tablet[c] || []).length && !(data.mobile[c] || []).length) { el.classList.remove(c); if (!el.getAttribute('class')) el.removeAttribute('class'); }
}
