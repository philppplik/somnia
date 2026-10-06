import {Fragment,useEffect,useLayoutEffect,useMemo,useRef,useState,type MutableRefObject,type RefObject} from 'react';
import {Lock} from 'lucide-react';
import {applyHistory,applyOperations,breakpointFor,patchState} from '../store/appStore';
import type {EditorNode} from '../lib/editorPort';
import {useT} from '../lib/useT';
import {dragPadding,fmt,layoutHandles,paddingProps,paddingStrips,SIDES,type Box,type Mods,type Pad,type Side} from '../lib/paddingEdit';
import {readBox,emptyPad,type BoxInfo} from '../lib/paddingDom';
import {nodeLabel,type LockInfo} from '../lib/canvasLock';
import '../styles/canvas-overlay.css';

export interface PendingVerify { id: string; expected: Partial<Pad>; at: number }
export interface ToastState { text: string; undo: boolean; key: number }
interface Props {
  frame: RefObject<HTMLIFrameElement | null>; scale: number; rect: Box; node: EditorNode; lock: LockInfo; epoch: string;
  designFile: string; viewport: number; selectionWidth: number; showSize: boolean; showPadding: boolean; suspended: boolean;
  remeasure: () => void; onResizeStart: (e: React.PointerEvent<HTMLElement>) => void;
  pending: MutableRefObject<PendingVerify | null>; toast: ToastState | null; setToast: (t: ToastState | null) => void;
}
interface DragView { side: Side; sides: Side[]; mode: 'single' | 'pair' | 'all'; delta: number; values: Pad; line: { horizontal: boolean; pos: number; from: number; len: number } }
interface Pop { mode: 'single' | 'compact'; active: Side; vals: Record<Side, string>; start: Pad }
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const mod = () => (typeof navigator !== 'undefined' && /mac/i.test(navigator.platform) ? '⌘Z' : 'Ctrl+Z');
const scalePad = (p: Pad, k: number): Pad => ({ top: p.top * k, right: p.right * k, bottom: p.bottom * k, left: p.left * k });

export function CanvasSelection(p: Props) {
  const {t} = useT();
  const {frame, scale, rect, node, lock, epoch, designFile, viewport, remeasure, pending, setToast} = p;
  const [info, setInfo] = useState<BoxInfo | null>(null);
  const [hover, setHover] = useState<Side | null>(null);
  const [tip, setTip] = useState<Side | null>(null);
  const [drag, setDrag] = useState<DragView | null>(null);
  const [pop, setPop] = useState<Pop | null>(null);
  const saved = useRef<{css: string | null} | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const tipTimer = useRef<number | undefined>(undefined);
  const popRef = useRef<HTMLDivElement>(null);
  const inputs = useRef<Partial<Record<Side, HTMLInputElement | null>>>({});
  const getEl = () => frame.current?.contentDocument?.querySelector(`[data-editor-node="${node.id}"]`) as HTMLElement | null;
  const toastKey = useRef(0);
  const say = (text: string, undo: boolean) => setToast({text, undo, key: ++toastKey.current});

  useLayoutEffect(() => {
    const el = getEl(), win = frame.current?.contentWindow;
    setInfo(el && win ? readBox(win, el) : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect, epoch, node.id]);

  /* transient preview: inline !important longhands in the iframe, never in the source */
  const preview = (values: Pad, start: Pad) => {
    const el = getEl(); if (!el) return;
    if (!saved.current) saved.current = {css: el.getAttribute('style')};
    for (const s of SIDES) {
      if (Math.abs(values[s] - start[s]) > 0.001) el.style.setProperty(`padding-${s}`, `${fmt(values[s])}px`, 'important');
      else el.style.removeProperty(`padding-${s}`);
    }
    remeasure();
  };
  const restore = (animateTo?: Pad) => {
    const el = getEl(), sv = saved.current; saved.current = null;
    if (!el || !sv) return;
    const apply = () => { if (!el.isConnected) return; if (sv.css == null) el.removeAttribute('style'); else el.setAttribute('style', sv.css); remeasure(); };
    if (animateTo && !reduced()) {
      el.style.transition = 'padding 120ms ease-out';
      for (const s of SIDES) el.style.setProperty(`padding-${s}`, `${fmt(animateTo[s])}px`, 'important');
      const t0 = performance.now();
      const tick = () => { remeasure(); if (performance.now() - t0 < 130) requestAnimationFrame(tick); else apply(); };
      requestAnimationFrame(tick);
    } else apply();
  };
  const cancelAll = (animate: boolean, start?: Pad) => {
    cleanup.current?.(); cleanup.current = null;
    const had = !!saved.current;
    restore(animate ? start : undefined);
    setDrag(null); setPop(null);
    if (animate && had) say(t('canvas.padding.reset'), false);
  };
  useEffect(() => { cancelAll(false); return () => { cleanup.current?.(); cleanup.current = null; window.clearTimeout(tipTimer.current); }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [epoch, node.id, lock.locked, p.suspended]);

  const commit = (start: Pad, values: Pad, sides: Side[]) => {
    restore();
    const props = paddingProps(start, values);
    const changed = Object.keys(props).map(k => k.slice(8) as Side);
    if (!changed.length) { remeasure(); return; }
    try {
      applyOperations([{type: 'setStyle', file: designFile, nodeId: node.id, properties: props, breakpoint: breakpointFor(viewport)}]);
      pending.current = {id: node.id, expected: Object.fromEntries(changed.map(s => [s, values[s]])), at: Date.now()};
      if (changed.length === 1) say(t('canvas.padding.changed', {side: t('canvas.side.' + changed[0]), from: fmt(start[changed[0]]), to: fmt(values[changed[0]])}), true);
      else say(t('canvas.padding.changedMany'), true);
    } catch (err) { patchState({notice: String(err)}); remeasure(); }
    void sides;
  };

  /* ---- handle gestures ---- */
  const startLine = (side: Side, start: Pad, b: BoxInfo, box: Box) => {
    const bx = box.x + b.border.left * scale, bw = box.w - (b.border.left + b.border.right) * scale;
    const by = box.y + b.border.top * scale, bh = box.h - (b.border.top + b.border.bottom) * scale;
    if (side === 'top') return {horizontal: true, pos: by + start.top * scale, from: bx, len: bw};
    if (side === 'bottom') return {horizontal: true, pos: box.y + box.h - (b.border.bottom + start.bottom) * scale, from: bx, len: bw};
    if (side === 'left') return {horizontal: false, pos: bx + start.left * scale, from: by, len: bh};
    return {horizontal: false, pos: box.x + box.w - (b.border.right + start.right) * scale, from: by, len: bh};
  };
  const onDown = (e: React.PointerEvent<HTMLElement>, side: Side) => {
    if (lock.locked || !info || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    cancelAll(false);
    const target = e.currentTarget;
    try { target.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    const start = {...info.pad}, unsafe = info.unsafe.has(side), b = info;
    const line = startLine(side, start, b, {x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale});
    const st = {x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, mods: {alt: e.altKey, shift: e.shiftKey} as Mods};
    let last: ReturnType<typeof dragPadding> | null = null;
    const compute = () => {
      if (!st.moved) return;
      const dx = (st.lx - st.x0) / scale, dy = (st.ly - st.y0) / scale;
      const raw = side === 'top' ? dy : side === 'bottom' ? -dy : side === 'left' ? dx : -dx;
      last = dragPadding(start, side, raw, st.mods);
      preview(last.values, start);
      setDrag({side, sides: last.sides, mode: last.mode, delta: last.delta, values: last.values, line});
    };
    const move = (ev: PointerEvent) => {
      st.lx = ev.clientX; st.ly = ev.clientY; st.mods = {alt: ev.altKey, shift: ev.shiftKey};
      if (!st.moved && !unsafe && Math.hypot(st.lx - st.x0, st.ly - st.y0) >= 3) { st.moved = true; setPop(null); setTip(null); }
      compute();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); cancelAll(true, start); return; }
      if (ev.key === 'Alt' || ev.key === 'Shift') { if (ev.key === 'Alt') ev.preventDefault(); st.mods = {alt: ev.type === 'keydown' ? (ev.key === 'Alt' ? true : st.mods.alt) : (ev.key === 'Alt' ? false : st.mods.alt), shift: ev.type === 'keydown' ? (ev.key === 'Shift' ? true : st.mods.shift) : (ev.key === 'Shift' ? false : st.mods.shift)}; compute(); }
    };
    const finish = (commitIt: boolean) => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', abort); target.removeEventListener('lostpointercapture', abort);
      window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', key, true); window.removeEventListener('blur', abort);
      cleanup.current = null; void commitIt;
    };
    const up = () => {
      finish(true);
      if (!st.moved) { setDrag(null); if (!lock.locked) openPopover('single', side, b); return; }
      setDrag(null);
      if (last) commit(start, last.values, last.sides);
    };
    const abort = () => { if (!st.moved) { finish(false); setDrag(null); return; } finish(false); cancelAll(true, start); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', abort); target.addEventListener('lostpointercapture', abort);
    window.addEventListener('keydown', key, true); window.addEventListener('keyup', key, true); window.addEventListener('blur', abort);
    cleanup.current = () => finish(false);
  };
  const onKey = (e: React.KeyboardEvent<HTMLElement>, side: Side) => {
    const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir || !info || lock.locked || info.unsafe.has(side)) return;
    e.preventDefault();
    const res = dragPadding(info.pad, side, dir * (e.shiftKey ? 10 : 1), {alt: e.altKey, shift: false});
    commit({...info.pad}, res.values, res.sides);
  };

  /* ---- numeric popover ---- */
  const openPopover = (mode: Pop['mode'], side: Side, b: BoxInfo | null = info) => {
    if (!b || lock.locked) return;
    setTip(null);
    setPop({mode, active: side, start: {...b.pad}, vals: Object.fromEntries(SIDES.map(s => [s, fmt(b.pad[s])])) as Record<Side, string>});
  };
  const popValues = (pp: Pop, vals = pp.vals): Pad => {
    const out = {...pp.start};
    for (const s of SIDES) { const n = Number(vals[s].trim().replace(',', '.')); if (vals[s].trim() !== '' && Number.isFinite(n) && n >= 0 && !info?.unsafe.has(s)) out[s] = n; }
    return out;
  };
  const setVal = (pp: Pop, side: Side, v: string) => {
    const vals = {...pp.vals, [side]: v};
    setPop({...pp, vals}); preview(popValues(pp, vals), pp.start);
  };
  const popCommit = (pp: Pop) => { const v = popValues(pp); setPop(null); commit(pp.start, v, SIDES); };
  const popCancel = (_pp?: Pop) => { const had = !!saved.current; restore(); setPop(null); if (had) say(t('canvas.padding.reset'), false); };
  useEffect(() => {
    if (!pop) return;
    const down = (e: PointerEvent) => { if (!popRef.current?.contains(e.target as Node) && !(e.target as HTMLElement)?.closest?.('[data-cv-handle]')) popCancel(pop); };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop?.mode]);
  useEffect(() => { if (!pop) return; const el = inputs.current[pop.mode === 'compact' ? 'top' : pop.active]; el?.focus(); el?.select(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pop?.active, pop?.mode]);

  if (!info) return null;
  const box: Box = {x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale};
  const padS = scalePad(info.pad, scale), borderS = scalePad(info.border, scale);
  const layout = layoutHandles(box, padS, borderS);
  const strips = paddingStrips(box, padS, borderS);
  const interactive = !lock.locked && p.showPadding && !p.suspended;
  const dragging = !!drag;
  const labelBelow = box.y - 28 - (layout.mode === 'outside' ? 14 : 0) < 0;
  const W = p.selectionWidth;
  const lockedBy = lock.by ? nodeLabel(lock.by) : '';
  const labelText = `${nodeLabel(node)} · ${Math.round(rect.w)} × ${Math.round(rect.h)}`;
  const sideName = (s: Side) => t('canvas.side.' + s);
  const badgeText = drag ? (drag.mode === 'single' ? t('canvas.padding.badge', {side: sideName(drag.side), value: fmt(drag.values[drag.side])})
    : drag.mode === 'all' ? t('canvas.padding.badgeAll', {delta: (drag.delta > 0 ? '+' : '') + fmt(drag.delta)})
    : t(drag.side === 'left' || drag.side === 'right' ? 'canvas.padding.badgePairH' : 'canvas.padding.badgePairV', {delta: (drag.delta > 0 ? '+' : '') + fmt(drag.delta)})) : '';
  const handle = layout.handles.find(h => h.side === drag?.side);
  const badgePos = (() => {
    if (!drag || !handle) return {left: box.x, top: box.y - 30};
    const bw = badgeText.length * 6.8 + 34, margin = 8;
    let left = handle.cx - bw / 2, top = handle.cy - 32;
    if (drag.side === 'left' && handle.cx - bw - margin - 8 >= margin) { left = handle.cx - bw - margin - 8; top = handle.cy - 11; }
    if (drag.side === 'right') { left = handle.cx + margin + 8; top = handle.cy - 11; }
    if (drag.side === 'bottom') top = handle.cy + 14;
    return {left: Math.max(margin, left), top: Math.max(margin, top)};
  })();
  const tipHandle = layout.handles.find(h => h.side === tip);
  const ov = Math.max(box.x + box.w + 400, 400);
  const compact = pop?.mode === 'compact';
  const popLeft = compact ? Math.max(8, box.x + box.w + 10) : (box.x - 160 >= 8 ? box.x - 160 : box.x + box.w + 10);
  const popTop = Math.max(8, compact ? box.y : box.y + box.h / 2 - 44);
  const strokeSides = new Set<Side>(drag ? drag.sides : hover ? [hover] : []);
  const unsafeHint = (s: Side) => info.unsafe.has(s);
  const toastLeft = Math.max(8, Math.min(box.x, ov - 340));
  return <div className="cv-overlay" data-testid="canvas-selection" data-handle-mode={layout.mode} data-locked={lock.locked ? 'true' : 'false'} style={{'--cv-w': `${W}px`} as React.CSSProperties}>
    <div className={'cv-outline' + (lock.locked ? ' is-locked' : '')} data-testid="selection-outline" style={{left: box.x, top: box.y, width: box.w, height: box.h}}/>
    {interactive && SIDES.filter(s => strokeSides.has(s)).map(s => <div key={s} className={'cv-strip' + (dragging ? ' is-strong' : '')} data-testid={`padding-strip-${s}`} style={{left: strips[s].x, top: strips[s].y, width: strips[s].w, height: strips[s].h}}/>)}
    {drag && <div className="cv-startline" style={drag.line.horizontal ? {left: drag.line.from, top: drag.line.pos, width: drag.line.len, height: 0, borderTopWidth: 1.5} : {left: drag.line.pos, top: drag.line.from, height: drag.line.len, width: 0, borderLeftWidth: 1.5}}/>}
    <div className={'cv-label' + (lock.locked ? ' is-locked' : '') + (dragging ? ' is-hidden' : '')} style={{left: box.x - 2, top: labelBelow ? box.y + box.h + 6 + (layout.mode === 'outside' ? 14 : 0) : box.y - 26 - (layout.mode === 'outside' ? 14 : 0)}} title={lock.locked ? (lock.inherited ? t('canvas.lock.inherited', {name: lockedBy}) : t('canvas.lock.locked')) : labelText}>
      {lock.locked && <Lock size={11} aria-label={lock.inherited ? t('canvas.lock.inherited', {name: lockedBy}) : t('canvas.lock.locked')} role="img"/>}
      {layout.mode === 'popover' && interactive
        ? <button type="button" className="cv-label-btn" aria-label={t('canvas.padding.edit')} onClick={() => openPopover('compact', 'top')}>{labelText}</button>
        : <span>{labelText}</span>}
    </div>
    {interactive && layout.handles.map(h => {
      const vertical = h.side === 'left' || h.side === 'right';
      const unsafe = unsafeHint(h.side);
      return <Fragment key={h.side}>
        {h.leader && <div className="cv-leader" style={h.leader.x1 === h.leader.x2 ? {left: h.leader.x1, top: Math.min(h.leader.y1, h.leader.y2), height: Math.abs(h.leader.y2 - h.leader.y1)} : {top: h.leader.y1, left: Math.min(h.leader.x1, h.leader.x2), width: Math.abs(h.leader.x2 - h.leader.x1)}}/>}
        <div role="slider" tabIndex={0} data-cv-handle={h.side} data-testid={`padding-handle-${h.side}`} aria-label={t('canvas.padding.aria', {side: sideName(h.side)})} aria-orientation={vertical ? 'horizontal' : 'vertical'} aria-valuemin={0} aria-valuenow={Math.round(info.pad[h.side] * 100) / 100} aria-valuetext={`${fmt(info.pad[h.side])} px`} aria-disabled={unsafe || undefined}
          className={'cv-handle ' + (vertical ? 'is-v' : 'is-h') + (hover === h.side || drag?.side === h.side ? ' is-active' : '') + (unsafe ? ' is-unsafe' : '')}
          style={{left: h.hit.x, top: h.hit.y, cursor: unsafe ? 'default' : vertical ? 'ew-resize' : 'ns-resize'}}
          onPointerDown={e => onDown(e, h.side)} onKeyDown={e => onKey(e, h.side)}
          onPointerEnter={() => { setHover(h.side); window.clearTimeout(tipTimer.current); tipTimer.current = window.setTimeout(() => setTip(h.side), 400); }}
          onPointerLeave={() => { setHover(null); setTip(null); window.clearTimeout(tipTimer.current); }}
          onFocus={() => setHover(h.side)} onBlur={() => setHover(null)}>
          <span className="cv-grip" style={{width: h.w, height: h.h}}/>
        </div>
      </Fragment>;
    })}
    {p.showSize && !lock.locked && !p.suspended && !dragging && <button type="button" className="cv-size" aria-label={t('rest.designCanvas.resizeSelection')} style={{left: box.x + box.w - 5, top: box.y + box.h - 5}} onPointerDown={p.onResizeStart}/>}
    {drag && <div className="cv-badge" data-testid="padding-badge" style={badgePos}><i/>{badgeText}</div>}
    {tip && tipHandle && !dragging && !pop && <div className="cv-tip" role="tooltip" style={{left: Math.max(8, tipHandle.cx - 90), top: tipHandle.cy + (tipHandle.side === 'bottom' ? 20 : -50)}}>
      <b>{t('canvas.padding.badge', {side: sideName(tip), value: fmt(info.pad[tip])})}</b><br/><span>{unsafeHint(tip) ? t('canvas.padding.unitHint') : t('canvas.padding.hint')}</span></div>}
    {pop && <div ref={popRef} className={'cv-pop' + (compact ? ' is-compact' : '')} role="dialog" aria-label={t('canvas.padding.title')} style={{left: popLeft, top: popTop}}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); popCancel(pop); }
        else if (e.key === 'Enter') { e.preventDefault(); popCommit(pop); }
        else if (e.key === 'Tab' && !compact) { e.preventDefault(); const i = SIDES.indexOf(pop.active); setPop({...pop, active: SIDES[(i + (e.shiftKey ? 3 : 1)) % 4]}); }
      }}>
      {(compact ? SIDES : [pop.active]).map(s => <label key={s} className="cv-pop-row">
        <span>{compact ? t('canvas.padding.short.' + s) : t('canvas.padding.aria', {side: sideName(s)})}</span>
        <input ref={el => { inputs.current[s] = el; }} inputMode="decimal" aria-label={t('canvas.padding.aria', {side: sideName(s)}) + ' px'} disabled={unsafeHint(s)} value={pop.vals[s]}
          onChange={e => setVal(pop, s, e.target.value)}
          onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const cur = Number(pop.vals[s].replace(',', '.')); const base = Number.isFinite(cur) ? cur : pop.start[s]; setVal(pop, s, fmt(Math.max(0, base + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)))); } }}/>
        {!compact && <em>px</em>}
      </label>)}
      <div className="cv-pop-hint">{(compact ? SIDES : [pop.active]).some(unsafeHint) ? t('canvas.padding.unitHint') : t('canvas.padding.numericHint')}</div>
    </div>}
    {p.toast && <div className="cv-toast" role="status" key={p.toast.key} style={{left: toastLeft, top: Math.min(box.y + box.h + 12, box.y + 200)}}><span>{p.toast.text}</span>{p.toast.undo && <button type="button" onClick={() => { applyHistory('undo'); setToast(null); }}>{t('canvas.padding.undo', {key: mod()})}</button>}</div>}
  </div>;
}
export {emptyPad};
