import { useEffect, useState } from 'react';
import { Crop, FlipHorizontal2, FlipVertical2, Link2, Link2Off, RotateCcw, RotateCw } from 'lucide-react';
import { Button } from '../ui/button';
import { useT } from '../../lib/useT';
import { ASPECT_PRESETS, aspectRatio, resolveResizeSize, type AspectPreset, type CropRect, type ResizeFilter } from '../../lib/imgedit/transform';
import { cropOp, flipOp, initialCropRect, resizeOp, rotateOp, type ImageOperation } from '../../lib/imgedit/handlers';

export interface TransformPanelProps {
  /** Size of the image as it is at the current point in the operations stack. */
  width: number; height: number;
  /** Live crop rectangle owned by the canvas overlay (image pixels). null = crop tool not active. */
  cropRect: CropRect | null;
  aspect: AspectPreset;
  onAspectChange(a: AspectPreset, rect: CropRect): void;
  onCropRectChange(r: CropRect): void;
  /** Adds an op to the document's operations stack. */
  onCommit(op: ImageOperation): void;
  disabled?: boolean;
}

const field = 'h-7 w-full rounded-sm border border-line bg-elevated px-2 text-[11px] text-ink tabular-nums';
const FILTERS: ResizeFilter[] = ['lanczos3', 'lanczos2', 'bilinear', 'nearest'];

function Num({ label, value, onChange, min = 1, max = 16384, step = 1, disabled }: { label: string; value: number; onChange(v: number): void; min?: number; max?: number; step?: number; disabled?: boolean }) {
  return <label className="flex min-w-0 flex-1 flex-col gap-1 text-[10px] text-ink-2">{label}
    <input className={field} type="number" inputMode="decimal" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ''} disabled={disabled}
      onChange={(e) => { const v = e.currentTarget.valueAsNumber; if (Number.isFinite(v)) onChange(v); }} /></label>;
}

export function TransformPanel(p: TransformPanelProps) {
  const { t } = useT();
  const { width, height, cropRect, aspect, disabled } = p;
  const [rw, setRw] = useState(width), [rh, setRh] = useState(height), [lock, setLock] = useState(true), [filter, setFilter] = useState<ResizeFilter>('lanczos3');
  const [angle, setAngle] = useState(0), [expand, setExpand] = useState(true);
  useEffect(() => { setRw(width); setRh(height); }, [width, height]);
  const rect = cropRect ?? { x: 0, y: 0, width, height };
  const ratio = aspectRatio(aspect, width, height);
  const setCrop = (patch: Partial<CropRect>) => {
    const n = { ...rect, ...patch };
    if (ratio && patch.width !== undefined) n.height = Math.max(1, Math.round(n.width / ratio));
    else if (ratio && patch.height !== undefined) n.width = Math.max(1, Math.round(n.height * ratio));
    n.width = Math.min(n.width, width - n.x); n.height = Math.min(n.height, height - n.y);
    p.onCropRectChange({ x: Math.max(0, Math.round(n.x)), y: Math.max(0, Math.round(n.y)), width: Math.max(1, Math.round(n.width)), height: Math.max(1, Math.round(n.height)) });
  };
  const setSize = (which: 'w' | 'h', v: number) => {
    if (!lock) { which === 'w' ? setRw(Math.round(v)) : setRh(Math.round(v)); return; }
    const s = resolveResizeSize(width, height, which === 'w' ? { width: v } : { height: v }); setRw(s.width); setRh(s.height);
  };
  const sizeChanged = rw !== width || rh !== height;
  const cropChanged = !!cropRect && (rect.x !== 0 || rect.y !== 0 || rect.width !== width || rect.height !== height);

  return <section className="flex flex-col gap-4 p-3" aria-label={t('imgedit.transform.title')} data-testid="imgedit-transform-panel">
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-[11px] font-medium text-ink">{t('imgedit.crop')}</legend>
      <label className="flex flex-col gap-1 text-[10px] text-ink-2">{t('imgedit.crop.aspect')}
        <select className={field} value={aspect} data-testid="imgedit-aspect" onChange={(e) => { const a = e.currentTarget.value as AspectPreset; p.onAspectChange(a, initialCropRect(width, height, a)); }}>
          {ASPECT_PRESETS.map((a) => <option key={a} value={a}>{a === 'free' ? t('imgedit.crop.free') : a === 'original' ? t('imgedit.crop.original') : a}</option>)}
        </select></label>
      <div className="flex gap-2"><Num label="X" value={rect.x} min={0} max={width - 1} onChange={(v) => setCrop({ x: v })} /><Num label="Y" value={rect.y} min={0} max={height - 1} onChange={(v) => setCrop({ y: v })} /></div>
      <div className="flex gap-2"><Num label={t('imgedit.width')} value={rect.width} max={width} onChange={(v) => setCrop({ width: v })} /><Num label={t('imgedit.height')} value={rect.height} max={height} onChange={(v) => setCrop({ height: v })} /></div>
      <Button size="compact" variant="primary" disabled={!cropChanged} data-testid="imgedit-crop-apply" onClick={() => p.onCommit(cropOp(rect))}><Crop size={13} />{t('imgedit.crop.apply')}</Button>
    </fieldset>

    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-[11px] font-medium text-ink">{t('imgedit.resize')}</legend>
      <div className="flex items-end gap-1">
        <Num label={t('imgedit.width')} value={rw} onChange={(v) => setSize('w', v)} />
        <Button size="icon" className="size-7" aria-pressed={lock} aria-label={t('imgedit.resize.lock')} onClick={() => setLock(!lock)}>{lock ? <Link2 size={13} /> : <Link2Off size={13} />}</Button>
        <Num label={t('imgedit.height')} value={rh} onChange={(v) => setSize('h', v)} />
      </div>
      <label className="flex flex-col gap-1 text-[10px] text-ink-2">{t('imgedit.resize.quality')}
        <select className={field} value={filter} data-testid="imgedit-filter" onChange={(e) => setFilter(e.currentTarget.value as ResizeFilter)}>
          {FILTERS.map((f) => <option key={f} value={f}>{t(`imgedit.resize.filter.${f}`)}</option>)}
        </select></label>
      <Button size="compact" variant="primary" disabled={!sizeChanged} data-testid="imgedit-resize-apply" onClick={() => p.onCommit(resizeOp(rw, rh, filter))}>{t('imgedit.resize.apply')}</Button>
    </fieldset>

    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-[11px] font-medium text-ink">{t('imgedit.rotate')}</legend>
      <div className="flex gap-1">
        <Button size="compact" className="flex-1" aria-label={t('imgedit.rotate.left')} data-testid="imgedit-rotate-left" onClick={() => p.onCommit(rotateOp(270))}><RotateCcw size={13} />90°</Button>
        <Button size="compact" className="flex-1" aria-label={t('imgedit.rotate.right')} data-testid="imgedit-rotate-right" onClick={() => p.onCommit(rotateOp(90))}><RotateCw size={13} />90°</Button>
        <Button size="compact" className="flex-1" aria-label={t('imgedit.flip.h')} data-testid="imgedit-flip-h" onClick={() => p.onCommit(flipOp('horizontal'))}><FlipHorizontal2 size={13} /></Button>
        <Button size="compact" className="flex-1" aria-label={t('imgedit.flip.v')} data-testid="imgedit-flip-v" onClick={() => p.onCommit(flipOp('vertical'))}><FlipVertical2 size={13} /></Button>
      </div>
      <div className="flex items-end gap-2">
        <Num label={t('imgedit.rotate.angle')} value={angle} min={-360} max={360} step={0.1} onChange={setAngle} />
        <Button size="compact" disabled={angle % 360 === 0} data-testid="imgedit-rotate-apply" onClick={() => p.onCommit(rotateOp(angle, expand))}>{t('imgedit.rotate.apply')}</Button>
      </div>
      <label className="flex items-center gap-2 text-[10px] text-ink-2"><input type="checkbox" checked={expand} onChange={(e) => setExpand(e.currentTarget.checked)} />{t('imgedit.rotate.expand')}</label>
    </fieldset>
  </section>;
}
