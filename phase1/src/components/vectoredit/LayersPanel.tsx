import { useState } from 'react';
import { useT } from '../../lib/useT';
import type { VectorLayer } from '../../lib/vectoredit/types';

export interface LayersPanelProps {
  /** Layers in z-order, index 0 = bottom. The panel lists the top layer first. */
  layers: readonly VectorLayer[];
  selectedId?: string | null;
  onSelect?(id: string): void;
  onRename?(id: string, name: string): void;
  onToggleVisible?(id: string, visible: boolean): void;
  onToggleLocked?(id: string, locked: boolean): void;
  /** `to` is the target index in the bottom-first layer array. */
  onReorder?(id: string, to: number): void;
  disabled?: boolean;
}
function RenameField({ layer, onRename, disabled }: { layer: VectorLayer; onRename?: LayersPanelProps['onRename']; disabled?: boolean }) {
  const { t } = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const done = (save: boolean) => {
    const name = (draft ?? '').trim();
    if (save && name && name !== layer.name) onRename?.(layer.id, name);
    setDraft(null);
  };
  if (draft === null) {
    return <button type="button" disabled={disabled} data-testid="layer-name" title={t('vectoredit.layers.rename')}
      aria-label={`${t('vectoredit.layers.rename')}: ${layer.name}`}
      onDoubleClick={() => setDraft(layer.name)} onKeyDown={(e) => { if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); setDraft(layer.name); } }}
      style={{ all: 'unset', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}>{layer.name}</button>;
  }
  return <input autoFocus value={draft} maxLength={200} aria-label={t('vectoredit.layers.name')} data-testid="layer-name-input" style={{ flex: 1, minWidth: 0 }}
    onChange={(e) => setDraft(e.currentTarget.value)} onBlur={() => done(true)}
    onKeyDown={(e) => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); }} />;
}
export function LayersPanel({ layers, selectedId, onSelect, onRename, onToggleVisible, onToggleLocked, onReorder, disabled }: LayersPanelProps) {
  const { t } = useT();
  const top = layers.length - 1;
  return (
    <section aria-label={t('vectoredit.layers.title')} data-testid="vector-layers-panel" style={{ display: 'grid', gap: 6 }}>
      <h3 style={{ fontSize: 13, margin: 0 }}>{t('vectoredit.layers.title')}</h3>
      {layers.length === 0 ? <p data-testid="layers-empty" style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>{t('vectoredit.layers.empty')}</p> : (
        <ul role="listbox" aria-label={t('vectoredit.layers.title')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
          {[...layers].reverse().map((layer, row) => {
            const index = top - row, selected = layer.id === selectedId;
            return (
              <li key={layer.id} role="option" aria-selected={selected} data-testid="layer-row" data-layer-id={layer.id}
                onClick={() => onSelect?.(layer.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', borderRadius: 8, fontSize: 12, opacity: layer.visible ? 1 : 0.5, background: selected ? 'var(--accent-soft, rgba(124,58,237,.15))' : 'transparent' }}>
                <button type="button" disabled={disabled} aria-pressed={layer.visible} data-testid="layer-visible"
                  aria-label={`${layer.visible ? t('vectoredit.layers.hide') : t('vectoredit.layers.show')}: ${layer.name}`}
                  title={layer.visible ? t('vectoredit.layers.hide') : t('vectoredit.layers.show')}
                  onClick={(e) => { e.stopPropagation(); onToggleVisible?.(layer.id, !layer.visible); }}>{layer.visible ? '◉' : '○'}</button>
                <button type="button" disabled={disabled} aria-pressed={layer.locked} data-testid="layer-locked"
                  aria-label={`${layer.locked ? t('vectoredit.layers.unlock') : t('vectoredit.layers.lock')}: ${layer.name}`}
                  title={layer.locked ? t('vectoredit.layers.unlock') : t('vectoredit.layers.lock')}
                  onClick={(e) => { e.stopPropagation(); onToggleLocked?.(layer.id, !layer.locked); }}>{layer.locked ? '🔒' : '🔓'}</button>
                <RenameField layer={layer} onRename={onRename} disabled={disabled} />
                <span style={{ opacity: 0.6 }} data-testid="layer-kind">{t(`vectoredit.shape.${layer.shape.kind}`)}</span>
                <button type="button" disabled={disabled || index === top} data-testid="layer-up" aria-label={`${t('vectoredit.layers.moveUp')}: ${layer.name}`} title={t('vectoredit.layers.moveUp')}
                  onClick={(e) => { e.stopPropagation(); onReorder?.(layer.id, index + 1); }}>↑</button>
                <button type="button" disabled={disabled || index === 0} data-testid="layer-down" aria-label={`${t('vectoredit.layers.moveDown')}: ${layer.name}`} title={t('vectoredit.layers.moveDown')}
                  onClick={(e) => { e.stopPropagation(); onReorder?.(layer.id, index - 1); }}>↓</button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
