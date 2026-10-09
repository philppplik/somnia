import {useEffect, useState} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {FIELD_RULES, MIXED, normalizeHex, parseNumberField, shared} from '../../lib/design/inspectorModel';
import type {AlignKind, DesignInspectorProps, DesignNodePatch, DesignNodeView} from '../../lib/design/panelContract';
const row = 'grid gap-1.5 border-b border-subtle px-3 py-3 text-xs text-ink-2';
const field = 'h-7 w-full rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text aria-[invalid=true]:border-red-500';
type NumKey = keyof typeof FIELD_RULES;
/** Numeric field: commits on Enter/blur, Escape reverts, invalid input is rejected visibly and never reaches the document. */
function NumField({id, label, value, unit, disabled, onCommit}: {id: NumKey; label: string; value: number | typeof MIXED | undefined; unit?: string; disabled?: boolean; onCommit(v: number): void}) {
  const {t} = useT();
  const shown = value === MIXED ? '' : value === undefined ? '' : String(Math.round((id === 'opacity' ? value * 100 : value) * 1000) / 1000);
  const [draft, setDraft] = useState(shown);
  const [bad, setBad] = useState<string | null>(null);
  useEffect(() => { setDraft(shown); setBad(null); }, [shown]);
  const commit = () => {
    if (draft === shown) { setBad(null); return; }
    const r = parseNumberField(draft, FIELD_RULES[id]);
    if (!r.ok) { setBad(t(`design.inspector.invalid.${r.reason}`)); return; }
    setBad(null); onCommit(id === 'opacity' ? r.value / 100 : r.value);
  };
  return <label className="grid gap-1">{label}{unit ? ` (${unit})` : ''}
    <input type="text" inputMode="decimal" className={field} value={draft} placeholder={value === MIXED ? t('design.inspector.mixed') : ''} disabled={disabled}
      aria-invalid={bad ? 'true' : undefined} aria-describedby={bad ? `design-err-${id}` : undefined} data-testid={`design-field-${id}`}
      onChange={e => setDraft(e.currentTarget.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') { setDraft(shown); setBad(null); } }} />
    {bad && <span id={`design-err-${id}`} role="alert" className="text-red-600" data-testid={`design-field-${id}-error`}>{bad}</span>}
  </label>;
}
function ColorField({id, label, value, disabled, onCommit}: {id: 'fill' | 'stroke'; label: string; value: string | null | typeof MIXED | undefined; disabled?: boolean; onCommit(v: string | null): void}) {
  const {t} = useT();
  const shown = value === MIXED || value === undefined ? '' : value ?? '';
  const [draft, setDraft] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => { setDraft(shown); setBad(false); }, [shown]);
  const commit = () => {
    if (draft === shown) return;
    if (draft.trim() === '') { setBad(false); onCommit(null); return; }
    const hex = normalizeHex(draft);
    if (!hex) { setBad(true); return; }
    setBad(false); onCommit(hex);
  };
  return <label className="grid gap-1">{label}
    <span className="flex items-center gap-2">
      <input type="color" className="h-7 w-8 shrink-0 cursor-pointer rounded-sm border border-subtle bg-transparent p-0" value={normalizeHex(shown) ?? '#000000'} disabled={disabled}
        aria-label={`${label} ${t('design.inspector.picker')}`} data-testid={`design-field-${id}-picker`} onChange={e => onCommit(e.currentTarget.value.toLowerCase())} />
      <input type="text" className={field} value={draft} placeholder={value === MIXED ? t('design.inspector.mixed') : t('design.inspector.none')} disabled={disabled}
        aria-invalid={bad ? 'true' : undefined} data-testid={`design-field-${id}`} onChange={e => setDraft(e.currentTarget.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') { setDraft(shown); setBad(false); } }} />
    </span>
    {bad && <span role="alert" className="text-red-600" data-testid={`design-field-${id}-error`}>{t('design.inspector.invalid.hex')}</span>}
  </label>;
}
function TextField({node, disabled, onCommit}: {node: DesignNodeView; disabled?: boolean; onCommit(v: string): void}) {
  const {t} = useT();
  const [draft, setDraft] = useState(node.text ?? '');
  useEffect(() => setDraft(node.text ?? ''), [node.id, node.text]);
  return <label className="grid gap-1">{t('design.inspector.content')}
    <textarea rows={3} className={`${field} h-auto py-1`} value={draft} maxLength={5000} disabled={disabled} data-testid="design-field-text"
      onChange={e => setDraft(e.currentTarget.value)} onBlur={() => { if (draft !== (node.text ?? '')) onCommit(draft); }} />
  </label>;
}
const ALIGN: readonly {kind: AlignKind; glyph: string}[] = [
  {kind: 'left', glyph: '⇤'}, {kind: 'centerH', glyph: '↔'}, {kind: 'right', glyph: '⇥'},
  {kind: 'top', glyph: '⤒'}, {kind: 'centerV', glyph: '↕'}, {kind: 'bottom', glyph: '⤓'}];
/** Right-hand properties for the current selection (one or many). Multi-selection shows "Mixed" where values differ. */
export function DesignInspectorPanel({selection, onChange, onAlign, onDistribute, disabled}: DesignInspectorProps) {
  const {t} = useT();
  if (!selection.length) return <p className="p-3 text-xs text-ink-3" data-testid="design-inspector-empty">{t('design.inspector.empty')}</p>;
  const locked = disabled || selection.every(n => n.locked);
  const single = selection.length === 1 ? selection[0] : null;
  const num = (k: 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity') => shared(selection, n => n[k]) as number | typeof MIXED | undefined;
  const has = (pred: (n: DesignNodeView) => boolean) => selection.every(pred);
  const apply = (p: DesignNodePatch) => onChange(p);
  const multi = selection.length > 1;
  return <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0" data-testid="design-inspector">
    <div className={row}>
      <span className="text-ink" data-testid="design-inspector-title">{single ? `${t(`design.type.${single.type}`)}: ${single.name}` : t('design.inspector.multi', {count: selection.length})}</span>
      {selection.some(n => n.locked) && <span className="text-ink-3">{t('design.inspector.locked')}</span>}
    </div>
    <div className={row} data-testid="design-section-layout">
      <span className="text-ink">{t('design.inspector.layout')}</span>
      <div className="grid grid-cols-2 gap-2">
        <NumField id="x" label="X" value={num('x')} onCommit={v => apply({x: v})} />
        <NumField id="y" label="Y" value={num('y')} onCommit={v => apply({y: v})} />
        <NumField id="width" label={t('design.inspector.width')} value={num('width')} onCommit={v => apply({width: v})} />
        <NumField id="height" label={t('design.inspector.height')} value={num('height')} onCommit={v => apply({height: v})} />
        <NumField id="rotation" label={t('design.inspector.rotation')} unit="°" value={num('rotation')} onCommit={v => apply({rotation: v})} />
        <NumField id="opacity" label={t('design.inspector.opacity')} unit="%" value={num('opacity')} onCommit={v => apply({opacity: v})} />
      </div>
    </div>
    {multi && <div className={row} data-testid="design-section-align">
      <span className="text-ink">{t('design.inspector.align')}</span>
      <div className="flex flex-wrap gap-1">
        {ALIGN.map(a => <Button key={a.kind} size="compact" variant="outline" onClick={() => onAlign(a.kind)} data-testid={`design-align-${a.kind}`} aria-label={t(`design.align.${a.kind}`)} title={t(`design.align.${a.kind}`)}>{a.glyph}</Button>)}
      </div>
      <div className="flex gap-1">
        <Button size="compact" variant="outline" disabled={selection.length < 3} onClick={() => onDistribute('horizontal')} data-testid="design-distribute-horizontal">{t('design.distribute.horizontal')}</Button>
        <Button size="compact" variant="outline" disabled={selection.length < 3} onClick={() => onDistribute('vertical')} data-testid="design-distribute-vertical">{t('design.distribute.vertical')}</Button>
      </div>
    </div>}
    {has(n => n.type === 'rectangle' || n.type === 'frame') && <div className={row} data-testid="design-section-appearance">
      <span className="text-ink">{t('design.inspector.appearance')}</span>
      <ColorField id="fill" label={t('design.inspector.fill')} value={shared(selection, n => n.fill ?? null)} onCommit={v => apply({fill: v})} />
      <ColorField id="stroke" label={t('design.inspector.stroke')} value={shared(selection, n => n.stroke ?? null)} onCommit={v => apply({stroke: v})} />
      <div className="grid grid-cols-2 gap-2">
        <NumField id="strokeWidth" label={t('design.inspector.strokeWidth')} value={shared(selection, n => n.strokeWidth) as number | typeof MIXED | undefined} onCommit={v => apply({strokeWidth: v})} />
        {has(n => n.type === 'rectangle') && <NumField id="radius" label={t('design.inspector.radius')} value={shared(selection, n => n.radius) as number | typeof MIXED | undefined} onCommit={v => apply({radius: v})} />}
      </div>
    </div>}
    {has(n => n.type === 'text') && <div className={row} data-testid="design-section-text">
      <span className="text-ink">{t('design.inspector.typography')}</span>
      {single && <TextField node={single} onCommit={v => apply({text: v})} />}
      <ColorField id="fill" label={t('design.inspector.textColor')} value={shared(selection, n => n.fill ?? null)} onCommit={v => apply({fill: v})} />
      <NumField id="fontSize" label={t('design.inspector.fontSize')} unit="px" value={shared(selection, n => n.fontSize) as number | typeof MIXED | undefined} onCommit={v => apply({fontSize: v})} />
    </div>}
  </fieldset>;
}
