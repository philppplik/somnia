import { parse, serialize, pathOf, byPath, samePath, isAncestorPath, isVoid, setInline, getInline, setResponsive, responsiveValue } from './sdm.js';
import { SAMPLE, BLOCKS } from './sample.js';
import { icon } from './icons.js';
import { createEditor } from './editor.js';
import { makeZip } from './zip.js';
import { buildProps } from './props.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const LS = 'somnia.phase0.v1';
const SKIP = new Set(['script', 'style', 'link', 'meta', 'title', 'base', 'noscript', 'template']);
const CONTAINERS = new Set(['div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'ul', 'ol', 'form', 'figure', 'body', 'blockquote', 'li']);

const S = {
  files: {}, page: 'index.html', active: 'index.html', doc: null, sel: null, hover: null,
  mode: 'design', bp: 1280, zoom: 'fit', assets: new Map(), dir: null, dirty: new Set(),
  undo: [], redo: [], snap: null, lastKey: null, lastT: 0, collapsed: new Set(), frameReady: false, projectName: 'Lumen Studio',
};
const frame = $('#frame');
let editor;

/* ---------------- state / history ---------------- */
const snapshot = () => ({ files: { ...S.files }, page: S.page, sel: S.sel && [...S.sel] });
const clamp = (a, n) => { while (a.length > n) a.shift(); };

function pushHistory(key) {
  const now = Date.now();
  if (!(key && key === S.lastKey && now - S.lastT < 800)) { S.undo.push(S.snap); clamp(S.undo, 200); }
  S.redo = []; S.lastKey = key; S.lastT = now;
}
function commit(key, mutate) {
  pushHistory(key);
  mutate(S.doc);
  S.files[S.page] = serialize(S.doc);
  S.dirty.add(S.page);
  S.snap = snapshot();
  afterChange({ origin: 'canvas' });
}
function restore(snap) {
  const prevPage = S.page;
  S.files = { ...snap.files }; S.page = snap.page; S.doc = parse(S.files[S.page] || '');
  const keep = prevPage === S.page && S.sel && byPath(S.doc.body, S.sel) ? S.sel : null;
  S.sel = keep || (snap.sel && byPath(S.doc.body, snap.sel) ? [...snap.sel] : null);
  if (!S.files[S.active]) S.active = S.page;
  S.snap = snapshot(); S.lastKey = null;
  Object.keys(S.files).forEach((f) => S.dirty.add(f));
  editor.forgetAll(); editor.open(S.active, S.files[S.active]);
  initFrame(); renderAll(); persist();
}
function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); restore(S.undo.pop()); }
function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); restore(S.redo.pop()); }

function onCodeChange(name, text) {
  pushHistory('code:' + name);
  S.files[name] = text; S.dirty.add(name);
  if (name === S.page) {
    S.doc = parse(text);
    if (S.sel && !byPath(S.doc.body, S.sel)) S.sel = null;
    S.snap = snapshot();
    afterChange({ origin: 'code' });
  } else { S.snap = snapshot(); syncCanvas(); drawOverlay(); persist(); }
}

function afterChange({ origin }) {
  syncCanvas();
  if (origin !== 'code') editor.setText(S.page, S.files[S.page]);
  renderLayers(); renderProps(); renderCrumbs(); drawOverlay(); updateButtons(); persist();
}

/* ---------------- persistence ---------------- */
let saveT;
function persist() {
  clearTimeout(saveT);
  $('#save-state').className = 'save-state'; $('#save-state').textContent = S.dir && S.dirty.size ? `${S.dirty.size} unsaved to disk` : 'Saving...';
  saveT = setTimeout(() => {
    if (!S.dir) {
      try { localStorage.setItem(LS, JSON.stringify({ files: S.files, page: S.page, active: S.active, name: S.projectName })); } catch (e) { /* quota */ }
      $('#save-state').className = 'save-state ok'; $('#save-state').textContent = 'Saved in browser';
    }
  }, 350);
}

/* ---------------- canvas ---------------- */
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
function resolve(from, href) {
  if (!href || /^([a-z]+:|\/\/|#|data:)/i.test(href)) return null;
  const parts = (dirOf(from) + href.split(/[?#]/)[0]).split('/'); const out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
  return out.join('/');
}
const assetUrl = (from, href) => { const r = resolve(from, href); return r && S.assets.get(r); };
function cssWithAssets(text, from) {
  return text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => { const a = assetUrl(from, u); return a ? `url("${a}")` : m; });
}
function collectCss(doc, page) {
  const out = [];
  for (const el of doc.head.children) {
    if (el.localName === 'style') out.push(cssWithAssets(el.textContent, page));
    else if (el.localName === 'link' && /stylesheet/i.test(el.getAttribute('rel') || '')) {
      const f = resolve(page, el.getAttribute('href'));
      if (f && S.files[f] != null) out.push(cssWithAssets(S.files[f], f));
    }
  }
  return out;
}
const BASE_CSS = () => `
@font-face{font-family:Inter;src:url(${new URL('fonts/inter.woff2', location.href).href}) format('woff2');font-weight:100 900}
html{cursor:default}::selection{background:rgba(99,102,241,.3)}
[data-somnia-editing]{outline:none!important;cursor:text!important;caret-color:#6366f1}
img{-webkit-user-drag:none}`;

function initFrame() {
  S.frameReady = false;
  frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style id="somnia-base">${BASE_CSS()}</style></head><body></body></html>`;
}
frame.addEventListener('load', () => {
  S.frameReady = true; bindFrame(); syncCanvas(); fitFrame(); drawOverlay();
});

function syncCanvas() {
  if (!S.frameReady) return;
  const d = frame.contentDocument; if (!d || !d.body) return;
  $$('style[data-somnia]', d.head).forEach((n) => n.remove());
  collectCss(S.doc, S.page).forEach((c) => { const st = d.createElement('style'); st.setAttribute('data-somnia', ''); st.textContent = c; d.head.appendChild(st); });
  for (const a of [...d.body.attributes]) d.body.removeAttribute(a.name);
  for (const a of S.doc.body.attributes) d.body.setAttribute(a.name, a.value);
  d.documentElement.lang = S.doc.documentElement.lang || '';
  d.body.innerHTML = S.doc.body.innerHTML;
  if (S.assets.size) $$('img[src],source[src]', d).forEach((n) => { const a = assetUrl(S.page, n.getAttribute('src')); if (a) n.setAttribute('src', a); });
  S.editing = null;
}
const live = (path) => (S.frameReady && path ? byPath(frame.contentDocument.body, path) : null);

function bindFrame() {
  const d = frame.contentDocument;
  const pick = (e) => { const t = e.target; if (!t || t.nodeType !== 1) return null; if (t === d.documentElement) return []; return pathOf(t, d.body); };
  d.addEventListener('mouseover', (e) => { if (drag) return; const p = pick(e); if (!samePath(p, S.hover)) { S.hover = p; drawOverlay(); } });
  d.addEventListener('mouseleave', () => { S.hover = null; drawOverlay(); });
  d.addEventListener('click', (e) => { if (S.editing) return; e.preventDefault(); e.stopPropagation(); const p = pick(e); if (p) select(p); }, true);
  d.addEventListener('dblclick', (e) => { const p = pick(e); if (p) startEdit(p); });
  d.addEventListener('scroll', drawOverlay, true);
  d.addEventListener('keydown', onKey);
  d.addEventListener('submit', (e) => e.preventDefault());
  new ResizeObserver(drawOverlay).observe(d.documentElement);
}

/* text editing in place */
function editable(el) {
  if (!el || isVoid(el) || el === S.doc.body) return false;
  if (['svg', 'script', 'style', 'iframe', 'video', 'canvas', 'select', 'textarea'].includes(el.localName)) return false;
  for (const c of el.children) if (!['a', 'b', 'i', 'em', 'strong', 'span', 'br', 'small', 'code', 'mark', 'sub', 'sup', 'u', 'abbr', 'time'].includes(c.localName)) return false;
  return true;
}
function startEdit(path) {
  const m = byPath(S.doc.body, path), l = live(path);
  if (!m || !l || !editable(m)) return;
  select(path);
  const before = l.innerHTML;
  S.editing = { path, before };
  l.setAttribute('data-somnia-editing', '');
  l.contentEditable = 'plaintext-only'; if (l.contentEditable !== 'plaintext-only') l.contentEditable = 'true';
  l.focus();
  const r = frame.contentDocument.createRange(); r.selectNodeContents(l);
  const s = frame.contentWindow.getSelection(); s.removeAllRanges(); s.addRange(r);
  drawOverlay();
  const finish = (cancel) => {
    l.removeEventListener('blur', onBlur); l.removeEventListener('keydown', onK);
    const ed = S.editing; S.editing = null;
    l.removeAttribute('contenteditable'); l.removeAttribute('data-somnia-editing');
    let html = l.innerHTML.replace(/(<br\s*\/?>)+$/i, '');
    if (cancel || html === ed.before) { l.innerHTML = ed.before; drawOverlay(); return; }
    commit('text:' + path.join('.'), () => { byPath(S.doc.body, path).innerHTML = html; });
  };
  const onBlur = () => finish(false);
  const onK = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(true); }
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !/^(p|li|div|article|section)$/.test(l.localName))) { e.preventDefault(); l.blur(); }
    e.stopPropagation();
  };
  l.addEventListener('blur', onBlur); l.addEventListener('keydown', onK);
}

/* ---------------- selection overlay ---------------- */
const ov = $('#overlay');
function box(cls, r, extra) { const b = document.createElement('div'); b.className = 'ov-box ' + cls; Object.assign(b.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }, extra); ov.appendChild(b); return b; }
function drawOverlay() {
  ov.textContent = '';
  if (S.mode === 'code' || !S.frameReady) return;
  const win = frame.contentWindow;
  const hov = !drag && S.hover && !samePath(S.hover, S.sel) ? live(S.hover) : null;
  if (hov) box('ov-hover', hov.getBoundingClientRect());
  const el = live(S.sel);
  if (el) {
    const r = el.getBoundingClientRect(), cs = win.getComputedStyle(el);
    if (!S.editing && S.sel.length) {
      const f = (p) => parseFloat(cs[p]) || 0;
      const m = { t: f('marginTop'), r: f('marginRight'), b: f('marginBottom'), l: f('marginLeft') };
      const p = { t: f('paddingTop'), r: f('paddingRight'), b: f('paddingBottom'), l: f('paddingLeft') };
      if (m.t || m.r || m.b || m.l) {
        const o = { left: r.left - m.l, top: r.top - m.t, width: r.width + m.l + m.r, height: r.height + m.t + m.b };
        const b = box('ov-mar', o); b.style.clipPath = `polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,${m.l}px ${m.t}px,${m.l}px calc(100% - ${m.b}px),calc(100% - ${m.r}px) calc(100% - ${m.b}px),calc(100% - ${m.r}px) ${m.t}px,${m.l}px ${m.t}px)`;
      }
      if (p.t || p.r || p.b || p.l) {
        const b = box('ov-pad', r); b.style.clipPath = `polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,${p.l}px ${p.t}px,${p.l}px calc(100% - ${p.b}px),calc(100% - ${p.r}px) calc(100% - ${p.b}px),calc(100% - ${p.r}px) ${p.t}px,${p.l}px ${p.t}px)`;
      }
    }
    box('ov-sel', r);
    if (!S.editing) {
      const lab = document.createElement('div'); lab.className = 'ov-label' + (r.top < 22 ? ' below' : '');
      const m = S.sel.length ? byPath(S.doc.body, S.sel) : S.doc.body;
      lab.innerHTML = `<span>${m.localName}${m.id ? '#' + m.id : cn(m) ? '.' + cn(m) : ''}</span><span class="sz">${Math.round(r.width)} x ${Math.round(r.height)}</span>`;
      lab.style.left = Math.max(0, r.left) + 'px'; lab.style.top = (r.top < 22 ? r.bottom : r.top) + 'px';
      lab.addEventListener('pointerdown', (e) => startDrag(e, { type: 'move', path: S.sel, label: m.localName }));
      ov.appendChild(lab);
    }
  }
  if (drag && drag.drop) drawDrop(drag.drop);
}

/* ---------------- fit / zoom / breakpoints ---------------- */
const scroller = $('#canvas-scroll'), wrap = $('#frame-wrap'), sizer = $('#sizer');
function zoomValue() { if (S.zoom !== 'fit') return S.zoom; return Math.min(1, (scroller.clientWidth - 56) / S.bp); }
function fitFrame() {
  const z = zoomValue();
  const h = Math.max(520, Math.floor((scroller.clientHeight - 56) / z));
  frame.style.width = S.bp + 'px'; frame.style.height = h + 'px';
  wrap.style.width = S.bp + 'px'; wrap.style.height = h + 'px';
  wrap.style.transform = `scale(${z})`;
  sizer.style.width = S.bp * z + 'px'; sizer.style.height = h * z + 'px';
  $('#zoom-val').textContent = S.zoom === 'fit' ? `Fit ${Math.round(z * 100)}%` : Math.round(z * 100) + '%';
  $('#bp-label').textContent = S.bp + ' px';
  $$('#bp-seg button').forEach((b) => b.classList.toggle('on', +b.dataset.w === S.bp));
  drawOverlay();
}
new ResizeObserver(fitFrame).observe(scroller);
function setZoom(v) { S.zoom = v; fitFrame(); }
$('#zoom-in').onclick = () => setZoom(Math.min(2, +(zoomValue() + 0.1).toFixed(2)));
$('#zoom-out').onclick = () => setZoom(Math.max(0.2, +(zoomValue() - 0.1).toFixed(2)));
$('#zoom-val').onclick = () => setZoom('fit');
$$('#bp-seg button').forEach((b) => { b.innerHTML = icon(['monitor', 'tablet', 'smartphone'][+(b.dataset.w < 1000) + +(b.dataset.w < 500)], 15); b.onclick = () => { S.bp = +b.dataset.w; fitFrame(); renderProps(); }; });

/* ---------------- selection + model ops ---------------- */
function select(path) {
  S.sel = path ? [...path] : null;
  renderLayers(); renderProps(); renderCrumbs(); drawOverlay();
}
const modelEl = (p) => (p ? byPath(S.doc.body, p) : null);
const isBody = (p) => p && p.length === 0;

function deleteSel() {
  if (!S.sel || isBody(S.sel)) return;
  const path = S.sel;
  commit(null, () => { const el = modelEl(path); const par = el.parentElement; el.remove(); const n = par.children.length; S.sel = path.length > 1 || n ? (n ? [...path.slice(0, -1), Math.min(path[path.length - 1], n - 1)] : path.slice(0, -1)) : []; });
}
function duplicateSel() {
  if (!S.sel || isBody(S.sel)) return;
  const path = S.sel;
  commit(null, () => { const el = modelEl(path); const c = el.cloneNode(true); el.after(c); S.sel = pathOf(c, S.doc.body); });
}
function moveSel(dir) {
  if (!S.sel || isBody(S.sel)) return;
  const path = S.sel;
  const el = modelEl(path); const sib = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
  if (!sib) return;
  commit(null, () => { if (dir < 0) sib.before(el); else sib.after(el); S.sel = pathOf(el, S.doc.body); });
}
function selectParent() {
  if (S.sel && S.sel.length) select(S.sel.slice(0, -1)); else select(null);
}
const respKey = () => (S.bp <= 600 ? 'mobile' : S.bp <= 900 ? 'tablet' : null);
function setStyle(path, props, key) {
  commit((key || 'style:' + Object.keys(props).join(',')) + ':' + (respKey() || 'base'), () => {
    const el = modelEl(path);
    const rk = respKey();
    if (rk) setResponsive(S.doc, el, rk, props); else setInline(el, props);
  });
}
function setAttr(path, name, val, key) {
  commit(key || 'attr:' + name, () => {
    const el = modelEl(path);
    if (val === '' || val == null) el.removeAttribute(name); else el.setAttribute(name, val);
  });
}
function setText(path, text) {
  commit('content:' + path.join('.'), () => { modelEl(path).textContent = text; });
}
function setTag(path, tag) {
  commit(null, () => {
    const el = modelEl(path); const n = S.doc.createElement(tag);
    for (const a of el.attributes) n.setAttribute(a.name, a.value);
    while (el.firstChild) n.appendChild(el.firstChild);
    el.replaceWith(n); S.sel = pathOf(n, S.doc.body);
  });
}
function containerLike(el) { return CONTAINERS.has(el.localName); }
function placeNode(node, targetPath, pos) {
  const tgt = modelEl(targetPath);
  if (pos === 'in') tgt.appendChild(node);
  else if (pos === 'before') tgt.before(node);
  else tgt.after(node);
}
function doMove(from, to, pos) {
  if (samePath(from, to) || isAncestorPath(from, to) || !from.length) return;
  commit(null, () => { const el = modelEl(from); placeNode(el, to, pos); S.sel = pathOf(el, S.doc.body); });
  toast('Moved ' + modelEl(S.sel).localName);
}
function doInsert(html, to, pos) {
  const tpl = S.doc.createElement('template'); tpl.innerHTML = html.trim();
  const node = tpl.content.firstElementChild;
  commit(null, () => { placeNode(node, to, pos); S.sel = pathOf(node, S.doc.body); });
}
function insertBlock(b) {
  let to, pos;
  const sel = modelEl(S.sel);
  if (!sel || isBody(S.sel)) { const last = S.doc.body.lastElementChild; const tail = [...S.doc.body.children].reverse().findIndex((c) => !SKIP.has(c.localName)); const idx = S.doc.body.children.length - 1 - tail; to = tail < 0 ? [] : [idx]; pos = tail < 0 ? 'in' : 'after'; void last; }
  else if (containerLike(sel) && !S.sel.some(() => false)) { to = S.sel; pos = 'in'; }
  else { to = S.sel; pos = 'after'; }
  doInsert(b.html, to, pos);
  toast(`${b.label} added`);
}

/* ---------------- drag (insert / move on canvas) ---------------- */
let drag = null;
function startDrag(e, item) {
  e.preventDefault();
  const ghost = document.createElement('div'); ghost.className = 'ghost'; ghost.textContent = item.label; document.body.appendChild(ghost);
  const shield = document.createElement('div'); shield.className = 'shield'; document.body.appendChild(shield);
  drag = { item, ghost, x: e.clientX, y: e.clientY, moved: false, drop: null };
  const mv = (ev) => {
    if (!drag.moved && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 4) return;
    drag.moved = true; ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
    drag.drop = computeDrop(ev.clientX, ev.clientY); drawOverlay();
  };
  const up = () => {
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
    ghost.remove(); shield.remove(); const d = drag; drag = null; drawOverlay();
    if (!d.moved || !d.drop) { if (!d.moved && d.item.type === 'insert') insertBlock(d.item.block); return; }
    if (d.item.type === 'move') doMove(d.item.path, d.drop.path, d.drop.pos); else doInsert(d.item.block.html, d.drop.path, d.drop.pos);
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}
function computeDrop(cx, cy) {
  const fr = frame.getBoundingClientRect(), z = zoomValue();
  const x = (cx - fr.left) / z, y = (cy - fr.top) / z;
  if (x < 0 || y < 0 || x > S.bp || y > fr.height / z) return null;
  const d = frame.contentDocument; let t = d.elementFromPoint(x, y);
  if (!t) return null;
  if (t === d.documentElement) t = d.body;
  const moving = drag.item.type === 'move' ? drag.item.path : null;
  let path = pathOf(t, d.body); if (!path) return null;
  if (moving && (samePath(path, moving) || isAncestorPath(moving, path))) return null;
  const m = modelEl(path); if (!m) return null;
  const r = t.getBoundingClientRect();
  const par = t.parentElement && t !== d.body ? frame.contentWindow.getComputedStyle(t.parentElement) : null;
  const row = par && /flex/.test(par.display) && /row/.test(par.flexDirection);
  const f = row ? (x - r.left) / r.width : (y - r.top) / r.height;
  if (t === d.body) return { path: [], pos: 'in', rect: r };
  if (containerLike(m) && f > 0.28 && f < 0.72) return { path, pos: 'in', rect: r };
  return { path, pos: f < 0.5 ? 'before' : 'after', rect: r, row };
}
function drawDrop(dp) {
  const r = dp.rect, el = document.createElement('div');
  if (dp.pos === 'in') { el.className = 'ov-drop in'; Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); }
  else if (dp.row) { el.className = 'ov-drop'; Object.assign(el.style, { left: (dp.pos === 'before' ? r.left - 2 : r.right - 1) + 'px', top: r.top + 'px', width: '3px', height: r.height + 'px' }); }
  else { el.className = 'ov-drop'; Object.assign(el.style, { left: r.left + 'px', top: (dp.pos === 'before' ? r.top - 2 : r.bottom - 1) + 'px', width: r.width + 'px', height: '3px' }); }
  ov.appendChild(el);
}

/* ---------------- layers ---------------- */
const key = (p) => p.join('.');
const cn = (e) => [...e.classList].find((c) => !/^sm-[0-9a-f]{4,}$/.test(c));
function tagClass(n) { if (/^(section|header|footer|main|nav|aside|article|div|body|form|ul|ol)$/.test(n)) return 'c-sec'; if (/^(h[1-6]|p|span|li|blockquote|label)$/.test(n)) return 'c-txt'; return 'c-int'; }
function renderLayers() {
  const root = $('#layers'); root.textContent = '';
  const add = (el, path, depth) => {
    const row = document.createElement('div');
    row.className = 'lyr' + (samePath(path, S.sel) ? ' sel' : ''); row.style.paddingLeft = 6 + depth * 14 + 'px'; row.dataset.path = key(path);
    const kids = [...el.children].map((c, i) => [c, i]).filter(([c]) => !SKIP.has(c.localName));
    const tw = document.createElement('span'); tw.className = 'tw';
    if (kids.length) { const open = !S.collapsed.has(key(path)); tw.innerHTML = icon(open ? 'chevron-down' : 'chevron-right', 13); tw.onclick = (e) => { e.stopPropagation(); S.collapsed[open ? 'add' : 'delete'](key(path)); renderLayers(); }; }
    row.appendChild(tw);
    const name = el.id ? '#' + el.id : (cn(el) ? '.' + cn(el) : '');
    let own = ''; for (const c of el.childNodes) if (c.nodeType === 3) own += c.nodeValue; own = own.replace(/\s+/g, ' ').trim();
    row.insertAdjacentHTML('beforeend', `<span class="tag ${tagClass(el.localName)}">${el.localName}</span>${name ? `<span class="nm"></span>` : ''}${own ? `<span class="tx"></span>` : ''}`);
    if (name) $('.nm', row).textContent = name; if (own) $('.tx', row).textContent = own;
    row.onclick = () => select(path);
    row.ondblclick = () => { if (editable(el)) startEdit(path); };
    row.onmouseenter = () => { S.hover = path; drawOverlay(); }; row.onmouseleave = () => { S.hover = null; drawOverlay(); };
    if (path.length) {
      row.draggable = true;
      row.ondragstart = (e) => { e.dataTransfer.setData('text/somnia', key(path)); e.dataTransfer.effectAllowed = 'move'; S.dragFrom = path; };
    }
    row.ondragover = (e) => {
      if (!S.dragFrom) return; const from = S.dragFrom;
      if (samePath(from, path) || isAncestorPath(from, path)) return;
      e.preventDefault(); const r = row.getBoundingClientRect(), f = (e.clientY - r.top) / r.height;
      const pos = containerLike(el) && f > 0.3 && f < 0.7 ? 'in' : (f < 0.5 || !path.length ? (path.length ? 'before' : 'in') : 'after');
      row.dataset.pos = pos; row.classList.remove('drop-before', 'drop-after', 'drop-in'); row.classList.add('drop-' + pos);
    };
    row.ondragleave = () => row.classList.remove('drop-before', 'drop-after', 'drop-in');
    row.ondrop = (e) => { e.preventDefault(); row.classList.remove('drop-before', 'drop-after', 'drop-in'); const from = S.dragFrom; S.dragFrom = null; if (from) doMove(from, path, row.dataset.pos || 'in'); };
    row.ondragend = () => { S.dragFrom = null; };
    root.appendChild(row);
    if (!S.collapsed.has(key(path))) kids.forEach(([c, i]) => add(c, [...path, i], depth + 1));
  };
  add(S.doc.body, [], 0);
  const sel = $('.lyr.sel', root); if (sel) sel.scrollIntoView({ block: 'nearest' });
}

/* ---------------- breadcrumbs ---------------- */
function renderCrumbs() {
  const c = $('#crumbs'); c.textContent = '';
  const path = S.sel || [];
  for (let i = 0; i <= path.length; i++) {
    const p = path.slice(0, i), el = modelEl(p); if (!el) break;
    if (i) c.insertAdjacentHTML('beforeend', '<span class="sl">/</span>');
    const b = document.createElement('button'); b.textContent = el.localName + (el.id ? '#' + el.id : (cn(el) ? '.' + cn(el) : ''));
    if (S.sel && i === path.length) b.className = 'on'; b.onclick = () => select(p); c.appendChild(b);
  }
  if (!S.sel) c.insertAdjacentHTML('beforeend', '<span class="muted" style="margin-left:8px">Nothing selected</span>');
}

/* ---------------- props ---------------- */
function renderProps() {
  const root = $('#props'); const keepScroll = root.scrollTop;
  const active = document.activeElement && root.contains(document.activeElement) ? document.activeElement.dataset.fid : null;
  root.textContent = '';
  const m = modelEl(S.sel), l = live(S.sel);
  if (!m || !l) {
    root.innerHTML = `<div class="none"><b>Nothing selected.</b><br>Click an element on the canvas or in Layers. Double-click text to edit it in place.<br><br>
      <span class="kbd">Del</span> delete &nbsp;<span class="kbd">Ctrl/Cmd D</span> duplicate &nbsp;<span class="kbd">Esc</span> select parent &nbsp;<span class="kbd">Alt Up/Down</span> reorder &nbsp;<span class="kbd">Ctrl/Cmd K</span> commands</div>`;
    return;
  }
  buildProps(root, { m, l, scope: respKey(), own: (p) => (respKey() ? responsiveValue(S.doc, m, respKey(), p) : getInline(m, p)), win: frame.contentWindow, path: S.sel, isBody: isBody(S.sel), editable: editable(m),
    setStyle: (p, k) => setStyle(S.sel, p, k), setAttr: (n, v) => setAttr(S.sel, n, v), setText: (t) => setText(S.sel, t), setTag: (t) => setTag(S.sel, t), icon });
  root.scrollTop = keepScroll;
  if (active) { const n = $(`[data-fid="${active}"]`, root); if (n) n.focus(); }
}

/* ---------------- files tab ---------------- */
function renderFiles() {
  const root = $('#tab-files'); root.textContent = '';
  const head = document.createElement('div'); head.className = 'files-head';
  head.innerHTML = `<span>${S.dir ? 'Folder' : 'Project'}</span>`;
  const add = document.createElement('button'); add.className = 'icon-btn sm'; add.title = 'New file'; add.innerHTML = icon('file-plus', 15);
  add.onclick = () => { const n = prompt('New file name (e.g. about.html or css/extra.css)'); if (!n || S.files[n]) return; S.files[n] = /\.html?$/.test(n) ? '<!DOCTYPE html>\n<html>\n  <head>\n    <meta charset="utf-8">\n    <title>New page</title>\n  </head>\n  <body>\n    <h1>New page</h1>\n  </body>\n</html>\n' : ''; S.dirty.add(n); renderFiles(); openFile(n); persist(); };
  head.appendChild(add); root.appendChild(head);
  let lastDir = null;
  for (const f of Object.keys(S.files).sort((a, b) => (dirOf(a) + '\0' + a).localeCompare(dirOf(b) + '\0' + b))) {
    const dir = dirOf(f);
    if (dir !== lastDir && dir) { root.insertAdjacentHTML('beforeend', `<div class="dir"></div>`); root.lastChild.textContent = dir; } lastDir = dir;
    const row = document.createElement('div'); row.className = 'file' + (f === S.active ? ' on' : '');
    const ic = /\.html?$/.test(f) ? 'file-code' : /\.css$/.test(f) ? 'file-text' : 'file';
    row.innerHTML = `${icon(ic, 14)}<span class="grow"></span>${f === S.page ? '<span class="badge">page</span>' : ''}<button class="icon-btn sm x" title="Delete">${icon('trash-2', 13)}</button>`;
    $('.grow', row).textContent = f.slice(dir.length);
    row.onclick = () => openFile(f);
    $('.x', row).onclick = (e) => { e.stopPropagation(); if (f === S.page) return toast('The open page cannot be deleted'); if (confirm('Delete ' + f + '?')) { delete S.files[f]; editor.forget(f); if (S.active === f) S.active = S.page; S.dirty.delete(f); renderFiles(); renderFileTabs(); editor.open(S.active, S.files[S.active]); persist(); } };
    root.appendChild(row);
  }
  if (S.assets.size) root.insertAdjacentHTML('beforeend', `<div class="hint" style="padding-top:12px">${S.assets.size} asset file(s) available to the canvas.</div>`);
}
function openFile(f) {
  S.active = f;
  if (/\.html?$/.test(f) && f !== S.page) {
    S.page = f; S.doc = parse(S.files[f]); S.sel = null; S.snap = snapshot(); S.lastKey = null; initFrame(); renderAll();
  }
  editor.open(f, S.files[f]); renderFiles(); renderFileTabs();
  if (S.mode === 'design') setMode('split');
  $('#page-name').textContent = S.page;
}
function renderFileTabs() {
  const t = $('#file-tabs'); t.textContent = '';
  for (const f of Object.keys(S.files).filter((n) => /\.(html?|css|m?js)$/.test(n))) { const b = document.createElement('button'); b.textContent = f; if (f === S.active) b.className = 'on'; b.onclick = () => openFile(f); t.appendChild(b); }
}

/* ---------------- insert tab ---------------- */
function renderInsert() {
  const root = $('#tab-insert');
  root.innerHTML = '<div class="hint" style="padding-top:12px">Drag a block onto the canvas, or click to add it to the selection.</div><div class="blocks"></div>';
  const g = $('.blocks', root);
  for (const b of BLOCKS) {
    const n = document.createElement('div'); n.className = 'block'; n.innerHTML = icon(b.icon, 20) + `<span>${b.label}</span>`;
    n.addEventListener('pointerdown', (e) => startDrag(e, { type: 'insert', block: b, label: b.label }));
    g.appendChild(n);
  }
}

/* ---------------- modes / tabs / buttons ---------------- */
function setMode(m) {
  S.mode = m; document.body.dataset.mode = m;
  $$('#mode-seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  if (m !== 'design') { editor.open(S.active, S.files[S.active]); renderFileTabs(); }
  requestAnimationFrame(() => { fitFrame(); editor.measure(); drawOverlay(); });
}
$$('#mode-seg button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$$('#left-tabs button').forEach((b) => (b.onclick = () => {
  $$('#left-tabs button').forEach((x) => x.classList.toggle('on', x === b));
  for (const t of ['layers', 'files', 'insert']) $('#tab-' + t).hidden = t !== b.dataset.tab;
  if (b.dataset.tab === 'files') renderFiles();
}));
function updateButtons() { $('#btn-undo').disabled = !S.undo.length; $('#btn-redo').disabled = !S.redo.length; }
$('#btn-undo').innerHTML = icon('undo-2'); $('#btn-redo').innerHTML = icon('redo-2');
$('#btn-undo').onclick = undo; $('#btn-redo').onclick = redo;
$('#btn-open').innerHTML = icon('folder-open', 14) + 'Open folder';
$('#btn-preview').innerHTML = icon('play', 14) + 'Preview';
$('#btn-export').innerHTML = icon('download', 14) + 'Export';
$('#btn-cmd').innerHTML = icon('command', 15);

/* ---------------- export / preview / folder ---------------- */
function pageHtml(forPreview) {
  const d = parse(S.files[S.page]);
  for (const el of [...d.head.querySelectorAll('link[rel~=stylesheet]')]) {
    const f = resolve(S.page, el.getAttribute('href'));
    if (f && S.files[f] != null) { const st = d.createElement('style'); st.textContent = cssWithAssets(S.files[f], f); el.replaceWith(st); }
  }
  for (const el of [...d.querySelectorAll('script[src]')]) { const f = resolve(S.page, el.getAttribute('src')); if (f && S.files[f] != null) { el.removeAttribute('src'); el.textContent = S.files[f]; } }
  for (const n of d.querySelectorAll('img[src]')) { const a = assetUrl(S.page, n.getAttribute('src')); if (a) n.setAttribute('src', a); }
  void forPreview;
  return serialize(d);
}
$('#btn-preview').onclick = () => {
  const url = URL.createObjectURL(new Blob([pageHtml(true)], { type: 'text/html' }));
  window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
};
async function exportZip() {
  const enc = new TextEncoder(); const entries = Object.entries(S.files).map(([name, text]) => ({ name, data: enc.encode(text) }));
  for (const [name, url] of S.assets) { try { entries.push({ name, data: new Uint8Array(await (await fetch(url)).arrayBuffer()) }); } catch (e) { /* skip */ } }
  const blob = new Blob([makeZip(entries)], { type: 'application/zip' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (S.projectName || 'somnia-project').toLowerCase().replace(/\s+/g, '-') + '.zip'; a.click();
  toast(`Exported ${entries.length} files`);
}
$('#btn-export').onclick = exportZip;

const TEXT_EXT = /\.(html?|css|m?js|json|md|txt|svg|xml|webmanifest)$/i, ASSET_EXT = /\.(png|jpe?g|gif|webp|avif|ico|svg)$/i;
async function openFolder() {
  if (!window.showDirectoryPicker) return toast('Open folder needs Chrome, Edge or another browser with the File System Access API');
  let h; try { h = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e) { return; }
  const files = {}, assets = new Map(); let n = 0;
  const walk = async (dir, prefix) => {
    for await (const [name, e] of dir.entries()) {
      if (n > 600 || name.startsWith('.') || name === 'node_modules' || name === 'dist') continue;
      if (e.kind === 'directory') await walk(e, prefix + name + '/');
      else {
        const f = await e.getFile(); n++;
        if (TEXT_EXT.test(name) && f.size < 2e6) files[prefix + name] = await f.text();
        if (ASSET_EXT.test(name) && f.size < 20e6) assets.set(prefix + name, URL.createObjectURL(f));
      }
    }
  };
  await walk(h, '');
  const pages = Object.keys(files).filter((f) => /\.html?$/.test(f));
  if (!pages.length) return toast('No HTML file found in that folder');
  S.dir = h; S.files = files; S.assets = assets; S.projectName = h.name; $('#project-name').textContent = h.name;
  S.page = pages.includes('index.html') ? 'index.html' : pages[0]; S.active = S.page;
  S.dirty = new Set(); S.undo = []; S.redo = []; S.doc = parse(files[S.page]); S.sel = null; S.snap = snapshot();
  editor.forgetAll(); editor.open(S.active, files[S.active]); initFrame(); renderAll();
  toast(`Opened ${h.name}: ${Object.keys(files).length} files. Ctrl/Cmd+S writes changes back to disk.`);
}
$('#btn-open').onclick = openFolder;
async function saveAll() {
  if (!S.dir) { toast('Saved in this browser. Use Export to download, or Open folder to save to disk.'); return; }
  let c = 0;
  for (const f of [...S.dirty]) {
    if (S.files[f] == null) continue;
    let dir = S.dir; const parts = f.split('/'); const fn = parts.pop();
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
    const w = await (await dir.getFileHandle(fn, { create: true })).createWritable(); await w.write(S.files[f]); await w.close(); c++;
  }
  S.dirty.clear(); persist(); $('#save-state').className = 'save-state ok'; $('#save-state').textContent = 'Saved to disk'; toast(`Wrote ${c} file(s) to ${S.dir.name}`);
}

/* ---------------- palette ---------------- */
const pal = $('#palette'), palIn = $('#pal-input'), palList = $('#pal-list');
const COMMANDS = () => [
  ['View: Design', () => setMode('design')], ['View: Split', () => setMode('split')], ['View: Code', () => setMode('code')],
  ['Canvas: Desktop 1280', () => { S.bp = 1280; fitFrame(); renderProps(); }], ['Canvas: Tablet 820', () => { S.bp = 820; fitFrame(); renderProps(); }], ['Canvas: Mobile 390', () => { S.bp = 390; fitFrame(); renderProps(); }],
  ['Canvas: Fit to width', () => setZoom('fit')], ['Edit: Undo', undo], ['Edit: Redo', redo],
  ['Element: Duplicate', duplicateSel], ['Element: Delete', deleteSel], ['Element: Select parent', selectParent], ['Element: Move up', () => moveSel(-1)], ['Element: Move down', () => moveSel(1)],
  ...BLOCKS.map((b) => ['Insert: ' + b.label, () => insertBlock(b)]),
  ['File: Open folder...', openFolder], ['File: Export as ZIP', exportZip], ['File: Preview in new tab', () => $('#btn-preview').click()], ['File: Save', saveAll],
  ['Project: Reset to sample (Lumen Studio)', () => { if (confirm('Replace the current project with the sample?')) loadProject(SAMPLE, 'index.html', 'Lumen Studio'); }],
];
let palSel = 0, palItems = [];
function palRender() {
  const q = palIn.value.toLowerCase().trim();
  palItems = COMMANDS().filter(([n]) => !q || q.split(/\s+/).every((w) => n.toLowerCase().includes(w)));
  palSel = Math.min(palSel, Math.max(0, palItems.length - 1)); palList.textContent = '';
  palItems.forEach(([n], i) => { const li = document.createElement('li'); li.textContent = n; if (i === palSel) li.className = 'on'; li.onclick = () => palRun(i); li.onmousemove = () => { palSel = i; $$('li', palList).forEach((x, j) => x.classList.toggle('on', j === i)); }; palList.appendChild(li); });
}
function palRun(i) { const it = palItems[i]; palClose(); if (it) it[1](); }
function palOpen() { pal.hidden = false; palIn.value = ''; palSel = 0; palRender(); palIn.focus(); }
function palClose() { pal.hidden = true; }
palIn.oninput = () => { palSel = 0; palRender(); };
palIn.onkeydown = (e) => { if (e.key === 'Escape') palClose(); else if (e.key === 'ArrowDown') { palSel = Math.min(palItems.length - 1, palSel + 1); palRender(); e.preventDefault(); } else if (e.key === 'ArrowUp') { palSel = Math.max(0, palSel - 1); palRender(); e.preventDefault(); } else if (e.key === 'Enter') palRun(palSel); };
pal.onmousedown = (e) => { if (e.target === pal) palClose(); };
$('#btn-cmd').onclick = palOpen;

let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }

/* ---------------- keyboard ---------------- */
function onKey(e) {
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  const tgt = e.target, typing = tgt && (/^(input|textarea|select)$/i.test(tgt.localName) || tgt.isContentEditable || tgt.closest?.('.cm-editor'));
  if (mod && k === 'k') { e.preventDefault(); palOpen(); return; }
  if (mod && k === 's') { e.preventDefault(); saveAll(); return; }
  if (typing) return;
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && k === 'y') { e.preventDefault(); redo(); }
  else if (mod && k === 'd') { e.preventDefault(); duplicateSel(); }
  else if (k === 'delete' || k === 'backspace') { if (S.sel) { e.preventDefault(); deleteSel(); } }
  else if (k === 'escape') selectParent();
  else if (e.altKey && k === 'arrowup') { e.preventDefault(); moveSel(-1); }
  else if (e.altKey && k === 'arrowdown') { e.preventDefault(); moveSel(1); }
  else if (k === 'enter' && S.sel && S.sel.length) startEdit(S.sel);
}
document.addEventListener('keydown', onKey);

/* ---------------- boot ---------------- */
function renderAll() {
  renderLayers(); renderProps(); renderCrumbs(); renderFiles(); renderFileTabs(); updateButtons();
  $('#page-name').textContent = S.page; $('#project-name').textContent = S.projectName;
}
function loadProject(files, page, name) {
  S.dir = null; S.assets = new Map(); S.files = { ...files }; S.page = page; S.active = page; S.projectName = name;
  S.undo = []; S.redo = []; S.dirty = new Set(); S.doc = parse(S.files[page]); S.sel = null; S.snap = snapshot(); S.lastKey = null;
  editor.forgetAll(); editor.open(S.active, S.files[S.active]); initFrame(); renderAll(); persist();
}
editor = createEditor($('#cm'), { onChange: onCodeChange, onUndo: undo, onRedo: redo, onSave: saveAll });
renderInsert();
let saved = null; try { saved = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { /* ignore */ }
if (saved && saved.files && saved.files[saved.page]) loadProject(saved.files, saved.page, saved.name || 'Lumen Studio');
else loadProject(SAMPLE, 'index.html', 'Lumen Studio');
document.body.dataset.mode = 'design';
window.__somnia = { editor, S, select, commit, setMode, undo, redo, insertBlock, BLOCKS, startEdit, setStyle };
