// Properties panel: reads inline value (model) or computed value (canvas), writes inline styles.
const UNITLESS = new Set(['line-height', 'opacity', 'font-weight', 'flex', 'flex-grow', 'flex-shrink', 'z-index', 'order']);
const camel = (p) => p.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

function toHex(v) {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(v || '');
  if (!m) return null;
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
  return '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('');
}

export function buildProps(root, c) {
  const { m, l, win, setStyle, setAttr, icon } = c;
  const cs = win.getComputedStyle(l);
  const inline = (p) => c.own(p);
  const comp = (p) => cs.getPropertyValue(p);
  let fidN = 0; const fid = (k) => `${k}`;
  const norm = (p, v) => { v = v.trim(); return /^-?\d*\.?\d+$/.test(v) && v !== '0' && !UNITLESS.has(p) ? v + 'px' : v; };

  const section = (title) => { const s = el('div', 'sec', `<h4>${title}</h4>`); root.appendChild(s); return s; };
  const row = (parent, label, ctl) => { const r = el('div', 'row'); if (label) r.appendChild(el('label', null, label)); const w = el('div', 'ctl'); w.appendChild(ctl); r.appendChild(w); parent.appendChild(r); return r; };

  function textStyle(prop, opts = {}) {
    const i = el('input', 'inp'); i.dataset.fid = fid(prop + (opts.k || ''));
    const v = inline(prop); i.value = v || (opts.noComputed ? '' : comp(prop)); if (!v) i.classList.add('ph');
    if (opts.placeholder) i.placeholder = opts.placeholder;
    i.onchange = () => setStyle({ [prop]: norm(prop, i.value) });
    i.onkeydown = (e) => {
      if (e.key === 'Enter') { i.blur(); return; }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const mm = /^(-?\d*\.?\d+)([a-z%]*)$/.exec(i.value.trim()); if (!mm) return; e.preventDefault();
      const fine = UNITLESS.has(prop) && prop !== 'font-weight' && prop !== 'z-index';
      const step = (e.shiftKey ? 10 : 1) * (fine ? 0.1 : 1) * (prop === 'font-weight' ? 100 : 1);
      let n = parseFloat(mm[1]) + (e.key === 'ArrowUp' ? step : -step); n = Math.round(n * 100) / 100; if (prop === 'opacity') n = Math.min(1, Math.max(0, n));
      i.value = n + (mm[2] || (UNITLESS.has(prop) ? '' : 'px')); setStyle({ [prop]: i.value }, 'step:' + prop); 
    };
    return i;
  }
  function selectStyle(prop, options) {
    const s = el('select', 'inp'); s.dataset.fid = fid('s-' + prop);
    const v = inline(prop) || comp(prop);
    const list = options.includes(v) ? options : [v, ...options];
    for (const o of list) { const op = el('option'); op.value = o; op.textContent = o; s.appendChild(op); }
    s.value = v; if (!inline(prop)) s.classList.add('ph');
    s.onchange = () => setStyle({ [prop]: s.value });
    return s;
  }
  function segStyle(prop, options) {
    const g = el('div', 'seg sm'); const cur = inline(prop) || comp(prop);
    for (const o of options) {
      const b = el('button', cur === o.v || (o.alt && o.alt.includes(cur)) ? 'on' : '', o.icon ? icon(o.icon, 14) : o.label); if (o.title) b.title = o.title;
      b.onclick = () => setStyle({ [prop]: o.v }); g.appendChild(b);
    }
    return g;
  }
  function colorStyle(prop) {
    const w = el('div', 'color'); const v = inline(prop); const hex = toHex(v) || toHex(comp(prop)) || '#000000';
    const sw = el('label', 'sw'); sw.style.background = toHex(comp(prop)) ? hex : 'repeating-conic-gradient(#2a2a30 0 25%, #1c1c20 0 50%) 0 0/8px 8px';
    const pick = el('input'); pick.type = 'color'; pick.value = hex; pick.dataset.fid = fid('c-' + prop);
    pick.oninput = () => { t.value = pick.value; sw.style.background = pick.value; setStyle({ [prop]: pick.value }, 'color:' + prop); };
    sw.appendChild(pick);
    const t = el('input', 'inp mono'); t.dataset.fid = fid('ct-' + prop); t.value = v || (toHex(comp(prop)) || 'none'); if (!v) t.classList.add('ph');
    t.onchange = () => setStyle({ [prop]: t.value === 'none' ? '' : t.value });
    t.onkeydown = (e) => { if (e.key === 'Enter') t.blur(); };
    w.append(sw, t); return w;
  }
  function attrInput(name, label, parent, ph) {
    const i = el('input', 'inp'); i.dataset.fid = fid('a-' + name); i.value = m.getAttribute(name) || ''; if (ph) i.placeholder = ph;
    i.onchange = () => setAttr(name, i.value); i.onkeydown = (e) => { if (e.key === 'Enter') i.blur(); };
    row(parent, label, i); return i;
  }

  if (c.scope) { const note = el('div', 'scope', `Editing <b>${c.scope === 'mobile' ? 'Mobile' : 'Tablet'}</b> only. Values apply at <span class="mono">max-width ${c.scope === 'mobile' ? 600 : 900}px</span> and below. Switch to Desktop to change the base style.`); root.appendChild(note); }
  /* header */
  const head = el('div', 'sec');
  head.appendChild(el('h4', null, 'Element'));
  if (!c.isBody) {
    const tags = ['div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'ul', 'ol', 'li', 'a', 'button'];
    const sel = el('select', 'inp mono'); sel.dataset.fid = 'tag';
    for (const t of tags.includes(m.localName) ? tags : [m.localName, ...tags]) { const o = el('option'); o.value = o.textContent = t; sel.appendChild(o); }
    sel.value = m.localName; sel.onchange = () => c.setTag(sel.value);
    row(head, 'Tag', sel);
  } else row(head, 'Tag', el('span', 'mono muted', 'body (page)'));
  const idI = el('input', 'inp'); idI.dataset.fid = 'id'; idI.value = m.id || ''; idI.placeholder = 'none'; idI.onchange = () => setAttr('id', idI.value.trim().replace(/\s+/g, '-')); idI.onkeydown = (e) => { if (e.key === 'Enter') idI.blur(); };
  row(head, 'ID', idI);
  const clI = el('input', 'inp mono'); clI.dataset.fid = 'class'; const smc = [...m.classList].filter((x) => /^sm-[0-9a-f]{4,}$/.test(x)); clI.value = [...m.classList].filter((x) => !smc.includes(x)).join(' '); clI.placeholder = 'none'; clI.onchange = () => setAttr('class', [...clI.value.trim().split(/\s+/).filter(Boolean), ...smc].join(' ')); clI.onkeydown = (e) => { if (e.key === 'Enter') clI.blur(); };
  row(head, 'Classes', clI);
  if (m.localName === 'a') { attrInput('href', 'Link', head, 'https://'); const t = el('select', 'inp'); for (const o of ['', '_blank']) { const op = el('option'); op.value = o; op.textContent = o ? 'New tab' : 'Same tab'; t.appendChild(op); } t.value = m.getAttribute('target') || ''; t.onchange = () => setAttr('target', t.value); row(head, 'Open in', t); }
  if (m.localName === 'img') { attrInput('src', 'Source', head); attrInput('alt', 'Alt text', head, 'Describe the image'); }
  if (c.editable && !m.children.length && m.childNodes.length <= 1 && m.localName !== 'img') {
    const ta = el('textarea', 'inp'); ta.dataset.fid = 'content'; ta.value = m.textContent; ta.onchange = () => c.setText(ta.value);
    row(head, 'Text', ta).classList.add('top');
  }
  root.appendChild(head);

  /* layout */
  const lay = section('Layout');
  row(lay, 'Display', selectStyle('display', ['block', 'flex', 'grid', 'inline-block', 'inline', 'inline-flex', 'none']));
  const disp = comp('display');
  if (/flex/.test(disp)) {
    row(lay, 'Direction', segStyle('flex-direction', [{ v: 'row', label: 'Row' }, { v: 'column', label: 'Column' }, { v: 'row-reverse', label: 'Row rev', alt: [] }]));
    row(lay, 'Wrap', segStyle('flex-wrap', [{ v: 'nowrap', label: 'No wrap' }, { v: 'wrap', label: 'Wrap' }]));
    row(lay, 'Justify', selectStyle('justify-content', ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly', 'normal']));
    row(lay, 'Align', selectStyle('align-items', ['stretch', 'flex-start', 'center', 'flex-end', 'baseline', 'normal']));
    row(lay, 'Gap', textStyle('gap'));
  }
  if (/grid/.test(disp)) { row(lay, 'Columns', textStyle('grid-template-columns', { placeholder: 'repeat(3, 1fr)' })); row(lay, 'Gap', textStyle('gap')); }
  const par = l.parentElement && win.getComputedStyle(l.parentElement);
  if (par && /flex/.test(par.display)) row(lay, 'Flex', textStyle('flex', { placeholder: '1' }));

  /* size */
  const size = section('Size');
  const two = el('div', 'two');
  for (const [p, lb] of [['width', 'W'], ['height', 'H'], ['max-width', 'Max W'], ['min-height', 'Min H']]) { const r = el('div', 'row'); r.append(el('label', null, lb)); const w = el('div', 'ctl'); w.appendChild(textStyle(p)); r.appendChild(w); two.appendChild(r); }
  size.appendChild(two);

  /* spacing */
  const sp = section('Spacing');
  const boxEd = (kind, cls) => {
    const wrapB = el('div', cls); const g = el('div', 'box4');
    const mk = (side, pos) => { const i = textStyle(`${kind}-${side}`, { k: 'b' }); i.classList.add(pos); return i; };
    g.append(mk('top', 't'), mk('left', 'l'));
    const mid = el('div', 'lbl mid', kind); mid.style.textAlign = 'center'; g.append(mid, mk('right', 'r'), mk('bottom', 'b'));
    wrapB.appendChild(g); return wrapB;
  };
  const mb = boxEd('margin', 'boxm'); mb.style.marginBottom = '8px'; sp.appendChild(mb); sp.appendChild(boxEd('padding', 'boxp'));

  /* typography */
  const ty = section('Typography');
  row(ty, 'Font', textStyle('font-family'));
  const t2 = el('div', 'two');
  for (const [p, lb] of [['font-size', 'Size'], ['line-height', 'Line']]) { const r = el('div', 'row'); r.append(el('label', null, lb)); const w = el('div', 'ctl'); w.appendChild(textStyle(p)); r.appendChild(w); t2.appendChild(r); }
  ty.appendChild(t2);
  ty.appendChild(el('div', null)).style.height = '8px';
  row(ty, 'Weight', selectStyle('font-weight', ['300', '400', '500', '600', '700', '800']));
  row(ty, 'Spacing', textStyle('letter-spacing'));
  row(ty, 'Align', segStyle('text-align', [{ v: 'left', icon: 'align-left', alt: ['start'], title: 'Left' }, { v: 'center', icon: 'align-center', title: 'Center' }, { v: 'right', icon: 'align-right', alt: ['end'], title: 'Right' }]));
  row(ty, 'Color', colorStyle('color'));

  /* appearance */
  const ap = section('Appearance');
  row(ap, 'Fill', colorStyle('background-color'));
  row(ap, 'Radius', textStyle('border-radius'));
  const bw = el('div', 'two');
  { const r = el('div', 'row'); r.append(el('label', null, 'Border')); const w = el('div', 'ctl'); const i = el('input', 'inp'); i.dataset.fid = 'bw'; const bwv = comp('border-top-width'); i.value = inline('border-width') || inline('border') ? (inline('border-width') || inline('border')) : bwv; if (!inline('border-width') && !inline('border')) i.classList.add('ph'); i.onchange = () => { const v = norm('border-width', i.value); setStyle(parseFloat(v) > 0 ? { 'border-width': v, 'border-style': inline('border-style') || 'solid', 'border-color': inline('border-color') || '#e6e6e0' } : { 'border-width': v, 'border-style': '' }); }; w.appendChild(i); r.appendChild(w); bw.appendChild(r); }
  ap.appendChild(bw);
  if (parseFloat(comp('border-top-width')) > 0) row(ap, 'Border color', colorStyle('border-color'));
  row(ap, 'Opacity', textStyle('opacity'));
  const SH = { none: '', Small: '0 1px 2px rgba(16,16,24,.08), 0 1px 3px rgba(16,16,24,.1)', Medium: '0 8px 24px -8px rgba(16,16,24,.18)', Large: '0 24px 48px -12px rgba(16,16,24,.28)' };
  const shS = el('select', 'inp'); shS.dataset.fid = 'shadow'; const curSh = inline('box-shadow');
  let curName = Object.keys(SH).find((k) => SH[k] === curSh) || (curSh ? 'Custom' : 'none');
  for (const k of curName === 'Custom' ? ['Custom', ...Object.keys(SH)] : Object.keys(SH)) { const o = el('option'); o.value = o.textContent = k; shS.appendChild(o); }
  shS.value = curName; shS.onchange = () => { if (shS.value !== 'Custom') setStyle({ 'box-shadow': SH[shS.value] }); };
  row(ap, 'Shadow', shS);
  void fidN;
}
