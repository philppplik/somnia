import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useT } from '../../lib/useT';
import {
  DEFAULT_ADJUST_PARAMS, SLIDER_KEYS, addPoint, evalCurve, isNeutralAdjust, movePoint,
  normalizeAdjustParams, removePoint, type AdjustParams, type SliderKey,
} from '../../lib/imageedit/adjust';

export interface AdjustPanelProps {
  params: AdjustParams;
  /** Called on every slider/curve tick with the FULL params (atomic). Drive live preview from it. */
  onChange(next: AdjustParams): void;
  /** Called once when a drag/keyboard gesture ends: push one history entry here. */
  onCommit?(next: AdjustParams): void;
  disabled?: boolean;
}

const RANGE: Record<SliderKey, { min: number; max: number; step: number }> = {
  brightness: { min: -1, max: 1, step: 0.01 },
  contrast: { min: -1, max: 1, step: 0.01 },
  saturation: { min: -1, max: 1, step: 0.01 },
  hue: { min: -180, max: 180, step: 1 },
  temperature: { min: -1, max: 1, step: 0.01 },
  highlights: { min: -1, max: 1, step: 0.01 },
  shadows: { min: -1, max: 1, step: 0.01 },
};

const S = 192;

function CurveEditor({ params, onChange, onCommit, disabled }: AdjustPanelProps) {
  const { t } = useT();
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const [sel, setSel] = useState(0);
  const pts = params.curves;
  const push = (curves: typeof pts) => onChange({ ...params, curves });
  const toXY = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    const { x, y } = toXY(e);
    const hit = pts.findIndex((p) => Math.hypot((p.x - x) * S, (p.y - y) * S) < 9);
    if (hit >= 0) { drag.current = hit; setSel(hit); }
    else {
      const r = addPoint(pts, x, y);
      drag.current = r.index; setSel(r.index); push(r.points);
    }
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current === null) return;
    const { x, y } = toXY(e);
    push(movePoint(pts, drag.current, x, y));
  };
  const up = () => { if (drag.current !== null) { drag.current = null; onCommit?.(params); } };
  const key = (e: KeyboardEvent<SVGCircleElement>, i: number) => {
    const d = e.shiftKey ? 0.05 : 0.01;
    const p = pts[i];
    let next: typeof pts | null = null;
    if (e.key === 'ArrowUp') next = movePoint(pts, i, p.x, p.y + d);
    else if (e.key === 'ArrowDown') next = movePoint(pts, i, p.x, p.y - d);
    else if (e.key === 'ArrowLeft') next = movePoint(pts, i, p.x - d, p.y);
    else if (e.key === 'ArrowRight') next = movePoint(pts, i, p.x + d, p.y);
    else if (e.key === 'Delete' || e.key === 'Backspace') next = removePoint(pts, i);
    if (!next) return;
    e.preventDefault();
    push(next);
    onCommit?.({ ...params, curves: next });
  };
  const path = Array.from({ length: 65 }, (_, i) => {
    const x = i / 64;
    return `${i ? 'L' : 'M'}${(x * S).toFixed(1)},${((1 - evalCurve(pts, x)) * S).toFixed(1)}`;
  }).join(' ');
  return (
    <svg
      ref={ref} width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="group" aria-label={t('imageedit.adjust.curves')}
      data-testid="adjust-curve" style={{ touchAction: 'none', borderRadius: 12, background: 'var(--surface, #F8F9FB)' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
    >
      <line x1={0} y1={S} x2={S} y2={0} stroke="currentColor" opacity={0.15} />
      <path d={path} fill="none" stroke="var(--accent, #7c3aed)" strokeWidth={2} />
      {pts.map((p, i) => (
        <circle
          key={i} cx={p.x * S} cy={(1 - p.y) * S} r={i === sel ? 6 : 5} tabIndex={disabled ? -1 : 0}
          role="slider" aria-label={`${t('imageedit.adjust.curvePoint')} ${i + 1}`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.y * 100)}
          fill="var(--accent, #7c3aed)" stroke="#fff" strokeWidth={1.5}
          onFocus={() => setSel(i)} onKeyDown={(e) => key(e, i)}
          onDoubleClick={() => { const n = removePoint(pts, i); push(n); onCommit?.({ ...params, curves: n }); }}
        />
      ))}
    </svg>
  );
}

export function AdjustPanel(props: AdjustPanelProps) {
  const { params, onChange, onCommit, disabled } = props;
  const { t } = useT();
  const set = (k: SliderKey, v: number) => onChange(normalizeAdjustParams({ [k]: v }, params));
  return (
    <div data-testid="adjust-panel" style={{ display: 'grid', gap: 10 }}>
      {SLIDER_KEYS.map((k) => {
        const r = RANGE[k];
        const label = t(`imageedit.adjust.${k}`);
        return (
          <label key={k} style={{ display: 'grid', gap: 2 }} title={label}>
            <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>{label}</span>
              <output>{k === 'hue' ? `${params[k]}°` : params[k].toFixed(2)}</output>
            </span>
            <input
              type="range" min={r.min} max={r.max} step={r.step} value={params[k]} disabled={disabled}
              aria-label={label} data-testid={`adjust-${k}`}
              onChange={(e) => set(k, Number(e.currentTarget.value))}
              onPointerUp={() => onCommit?.(params)}
              onKeyUp={() => onCommit?.(params)}
              onDoubleClick={() => { const n = normalizeAdjustParams({ [k]: 0 }, params); onChange(n); onCommit?.(n); }}
            />
          </label>
        );
      })}
      <div style={{ fontSize: 12 }}>{t('imageedit.adjust.curves')}</div>
      <CurveEditor {...props} />
      <button
        type="button" disabled={disabled || isNeutralAdjust(params)} data-testid="adjust-reset"
        onClick={() => { const n = normalizeAdjustParams(DEFAULT_ADJUST_PARAMS); onChange(n); onCommit?.(n); }}
      >{t('imageedit.adjust.reset')}</button>
    </div>
  );
}
