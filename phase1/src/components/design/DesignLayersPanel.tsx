import {useState} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import type {DesignLayersProps, DesignNodeView} from '../../lib/design/panelContract';
function NameCell({row, onRename, disabled}: {row: DesignNodeView; onRename: DesignLayersProps['onRename']; disabled?: boolean}) {
  const {t} = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const done = (save: boolean) => { const n = (draft ?? '').trim(); if (save && n && n !== row.name) onRename(row.id, n); setDraft(null); };
  if (draft === null) return <button type="button" disabled={disabled || row.locked} data-testid="design-layer-name" className="min-w-0 flex-1 cursor-text truncate bg-transparent text-left text-xs text-ink"
    aria-label={`${t('design.layers.rename')}: ${row.name}`} title={t('design.layers.rename')}
    onDoubleClick={() => setDraft(row.name)} onKeyDown={e => { if (e.key === 'F2') { e.preventDefault(); setDraft(row.name); } }}>{row.name}</button>;
  return <input autoFocus value={draft} maxLength={120} aria-label={t('design.layers.name')} data-testid="design-layer-name-input"
    className="h-6 min-w-0 flex-1 rounded-sm border border-subtle bg-transparent px-1 text-xs text-ink select-text"
    onChange={e => setDraft(e.currentTarget.value)} onBlur={() => done(true)} onKeyDown={e => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); }} />;
}
/** Layers outline: select (Ctrl/Cmd/Shift adds), rename (double-click or F2), visibility, lock, reorder, duplicate, delete. */
export function DesignLayersPanel({rows, selectedIds, onSelect, onRename, onToggleVisible, onToggleLocked, onReorder, onDelete, onDuplicate, disabled}: DesignLayersProps) {
  const {t} = useT();
  const sel = new Set(selectedIds);
  const actionable = rows.filter(r => sel.has(r.id) && !r.locked).map(r => r.id);
  return <section aria-label={t('design.layers.title')} data-testid="design-layers-panel" className="grid gap-1.5 p-3 text-xs text-ink-2">
    <div className="flex items-center justify-between gap-2">
      <h3 className="m-0 text-xs font-medium text-ink">{t('design.layers.title')}</h3>
      <div className="flex gap-1">
        <Button size="compact" variant="ghost" disabled={disabled || !actionable.length} onClick={() => onDuplicate(actionable)} data-testid="design-layers-duplicate" aria-label={t('design.layers.duplicate')}>{t('design.layers.duplicate')}</Button>
        <Button size="compact" variant="ghost" disabled={disabled || !actionable.length} onClick={() => onDelete(actionable)} data-testid="design-layers-delete" aria-label={t('design.layers.delete')}>{t('design.layers.delete')}</Button>
      </div>
    </div>
    {rows.length === 0 ? <p data-testid="design-layers-empty" className="m-0 text-ink-3">{t('design.layers.empty')}</p> :
      <ul role="listbox" aria-multiselectable="true" aria-label={t('design.layers.title')} className="m-0 grid list-none gap-0.5 p-0">
        {rows.map((row, i) => {
          const selected = sel.has(row.id), isTop = i === 0 || rows[i - 1].depth < row.depth, isBottom = i === rows.length - 1 || rows[i + 1].depth < row.depth;
          return <li key={row.id} role="option" aria-selected={selected} aria-level={row.depth + 1} data-testid="design-layer-row" data-layer-id={row.id} data-layer-type={row.type}
            onClick={e => onSelect(row.id, e.shiftKey || e.ctrlKey || e.metaKey)}
            className={`flex items-center gap-1 rounded-sm px-1 py-0.5 ${selected ? 'bg-accent-soft' : ''} ${row.visible ? '' : 'opacity-50'}`} style={{paddingLeft: 4 + row.depth * 14}}>
            <Button size="row" variant="ghost" disabled={disabled} aria-pressed={row.visible} data-testid="design-layer-visible"
              aria-label={`${row.visible ? t('design.layers.hide') : t('design.layers.show')}: ${row.name}`}
              onClick={e => { e.stopPropagation(); onToggleVisible(row.id, !row.visible); }}>{row.visible ? '◉' : '○'}</Button>
            <Button size="row" variant="ghost" disabled={disabled} aria-pressed={row.locked} data-testid="design-layer-locked"
              aria-label={`${row.locked ? t('design.layers.unlock') : t('design.layers.lock')}: ${row.name}`}
              onClick={e => { e.stopPropagation(); onToggleLocked(row.id, !row.locked); }}>{row.locked ? '🔒' : '🔓'}</Button>
            <NameCell row={row} onRename={onRename} disabled={disabled} />
            <span className="text-ink-3" data-testid="design-layer-kind">{t(`design.type.${row.type}`)}</span>
            <Button size="row" variant="ghost" disabled={disabled || isTop} data-testid="design-layer-up" aria-label={`${t('design.layers.moveUp')}: ${row.name}`}
              onClick={e => { e.stopPropagation(); onReorder(row.id, 1); }}>↑</Button>
            <Button size="row" variant="ghost" disabled={disabled || isBottom} data-testid="design-layer-down" aria-label={`${t('design.layers.moveDown')}: ${row.name}`}
              onClick={e => { e.stopPropagation(); onReorder(row.id, -1); }}>↓</Button>
          </li>;
        })}
      </ul>}
  </section>;
}
