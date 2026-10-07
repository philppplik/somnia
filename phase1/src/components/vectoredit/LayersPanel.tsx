import { useState } from 'react';
import { useT } from '../../lib/useT';
import { outline, type OutlineRow } from '../../lib/imageedit/vector/scene';
import type { NodeId, VectorScene } from '../../lib/imageedit/vector/types';

export interface LayersPanelProps {
  scene: VectorScene;
  selectedId?: NodeId | null;
  onSelect?(id: NodeId): void;
  onRename?(id: NodeId, name: string): void;
  onToggleVisible?(id: NodeId, visible: boolean): void;
  onToggleLocked?(id: NodeId, locked: boolean): void;
  /**
   * Move within the same parent. `toIndex` is the target index in that parent's bottom-first child list.
   * The caller builds the op (see `reorderOp`).
   */
  onReorder?(id: NodeId, toIndex: number): void;
  disabled?: boolean;
}
function RenameField({ row, onRename, disabled }: { row: OutlineRow; onRename?: LayersPanelProps['onRename']; disabled?: boolean }) {
  const { t } = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const done = (save: boolean) => {
    const name = (draft ?? '').trim();
    if (save && name && name !== row.name) onRename?.(row.id, name);
    setDraft(null);
  };
  if (draft === null) {
    return <button type="button" disabled={disabled} data-testid="layer-name" title={t('vectoredit.layers.rename')}
      aria-label={`${t('vectoredit.layers.rename')}: ${row.name}`}
      onDoubleClick={() => setDraft(row.name)} onKeyDown={(e) => { if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); setDraft(row.name); } }}
      style={{ all: 'unset', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}>{row.name}</button>;
  }
  return <input autoFocus value={draft} maxLength={200} aria-label={t('vectoredit.layers.name')} data-testid="layer-name-input" style={{ flex: 1, minWidth: 0 }}
    onChange={(e) => setDraft(e.currentTarget.value)} onBlur={() => done(true)}
    onKeyDown={(e) => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); }} />;
}
export function LayersPanel({ scene, selectedId, onSelect, onRename, onToggleVisible, onToggleLocked, onReorder, disabled }: LayersPanelProps) {
  const { t } = useT();
  const rows = outline(scene);
  return (
    <section aria-label={t('vectoredit.layers.title')} data-testid="vector-layers-panel" style={{ display: 'grid', gap: 6 }}>
      <h3 style={{ fontSize: 13, margin: 0 }}>{t('vectoredit.layers.title')}</h3>
      {rows.length === 0 ? <p data-testid="layers-empty" style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>{t('vectoredit.layers.empty')}</p> : (
        <ul role="listbox" aria-label={t('vectoredit.layers.title')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
          {rows.map((row) => {
            const selected = row.id === selectedId, top = row.index === row.siblingCount - 1, bottom = row.index === 0;
            return (
              <li key={row.id} role="option" aria-selected={selected} aria-level={row.depth + 1} data-testid="layer-row" data-layer-id={row.id}
                onClick={() => onSelect?.(row.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', paddingLeft: 4 + row.depth * 14, borderRadius: 8, fontSize: 12, opacity: row.visible ? 1 : 0.5, background: selected ? 'var(--accent-soft, rgba(124,58,237,.15))' : 'transparent' }}>
                <button type="button" disabled={disabled} aria-pressed={row.visible} data-testid="layer-visible"
                  aria-label={`${row.visible ? t('vectoredit.layers.hide') : t('vectoredit.layers.show')}: ${row.name}`}
                  title={row.visible ? t('vectoredit.layers.hide') : t('vectoredit.layers.show')}
                  onClick={(e) => { e.stopPropagation(); onToggleVisible?.(row.id, !row.visible); }}>{row.visible ? '◉' : '○'}</button>
                <button type="button" disabled={disabled} aria-pressed={row.locked} data-testid="layer-locked"
                  aria-label={`${row.locked ? t('vectoredit.layers.unlock') : t('vectoredit.layers.lock')}: ${row.name}`}
                  title={row.locked ? t('vectoredit.layers.unlock') : t('vectoredit.layers.lock')}
                  onClick={(e) => { e.stopPropagation(); onToggleLocked?.(row.id, !row.locked); }}>{row.locked || row.lockedByAncestor ? '🔒' : '🔓'}</button>
                <RenameField row={row} onRename={onRename} disabled={disabled} />
                <span style={{ opacity: 0.6 }} data-testid="layer-kind">{t(`vectoredit.shape.${row.kind}`)}</span>
                <button type="button" disabled={disabled || top} data-testid="layer-up" aria-label={`${t('vectoredit.layers.moveUp')}: ${row.name}`} title={t('vectoredit.layers.moveUp')}
                  onClick={(e) => { e.stopPropagation(); onReorder?.(row.id, row.index + 1); }}>↑</button>
                <button type="button" disabled={disabled || bottom} data-testid="layer-down" aria-label={`${t('vectoredit.layers.moveDown')}: ${row.name}`} title={t('vectoredit.layers.moveDown')}
                  onClick={(e) => { e.stopPropagation(); onReorder?.(row.id, row.index - 1); }}>↓</button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
