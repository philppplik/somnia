import { useId, useRef } from 'react';
import { useT } from '../../lib/useT';
import { normalizeFilterParams, patchFilterOperation, type FilterType } from '../../lib/imageedit/filters';
import type { ImageOperation } from '../../lib/image-editor/types';

export interface FilterPanelProps {
  operation: ImageOperation;
  /** Live preview: receives an immutable, complete operation. */
  onChange(next: ImageOperation): void;
  /** One history entry per completed slider gesture, not per preview tick. */
  onCommit?(next: ImageOperation): void;
  disabled?: boolean;
}
export function FilterPanel({ operation, onChange, onCommit, disabled }: FilterPanelProps) {
  const { t } = useT();
  const id = useId();
  const pending = useRef<ImageOperation | null>(null);
  const params = normalizeFilterParams(operation.type as FilterType, operation.params);
  const commit = () => {
    if (pending.current) { onCommit?.(pending.current); pending.current = null; }
  };
  const label = t(`imageedit.filters.${operation.type}`);
  return (
    <fieldset disabled={disabled} data-testid="filter-panel" style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 10 }}>
      <legend style={{ fontSize: 13, marginBottom: 10 }}>{label}</legend>
      <label htmlFor={id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span>{t('imageedit.filters.strength')}</span><output htmlFor={id}>{Math.round(params.strength * 100)}%</output>
      </label>
      <input id={id} type="range" min={0} max={1} step={0.01} value={params.strength}
        aria-label={`${label}: ${t('imageedit.filters.strength')}`} aria-valuetext={`${Math.round(params.strength * 100)}%`}
        data-testid="filter-strength" style={{ width: '100%', accentColor: 'var(--accent, #7c3aed)' }}
        onChange={(event) => { const next = patchFilterOperation(operation, { strength: Number(event.currentTarget.value) }); pending.current = next; onChange(next); }}
        onPointerUp={commit} onPointerCancel={commit} onKeyUp={commit} onBlur={commit} />
      <button type="button" disabled={disabled || params.strength === 0} onClick={() => {
        const next = patchFilterOperation(operation, { strength: 0 }); pending.current = null; onChange(next); onCommit?.(next);
      }}>{t('imageedit.filters.reset')}</button>
    </fieldset>
  );
}
