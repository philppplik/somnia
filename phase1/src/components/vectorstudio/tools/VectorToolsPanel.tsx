import { useRef, useState, type CSSProperties } from 'react';
import type { VectorDocument } from '../../../lib/vectorio';
import { SvgImportError } from '../../../lib/vectorio';
import { deleteSelection, resizeSelection, rotateSelection, scaleSelection, selectionBounds, translateSelection, type VectorTool, type VectorToolCommit } from './operations';
import { downloadSvg, readSvgFile } from './svgIO';
export const vectorControlStyle: CSSProperties = { border: '1px solid var(--border, #d9dce3)', borderRadius: 8, padding: '6px 8px', color: 'inherit', background: 'var(--surface, #f8f9fb)', font: 'inherit', minWidth: 0 };
export interface VectorToolsPanelProps {
  value: VectorDocument;
  selection: readonly string[];
  onSelectionChange(selection: string[]): void;
  onCommit(commit: VectorToolCommit): void;
  tool?: VectorTool;
  onToolChange?(tool: VectorTool): void;
  disabled?: boolean;
  exportName?: string;
  /** Host may save via its native save dialog. Browser download is the fallback. */
  onExport?(value: VectorDocument): void;
}
export function VectorToolsPanel({ value, selection, onSelectionChange, onCommit, tool = 'select', onToolChange, disabled, exportName, onExport }: VectorToolsPanelProps) {
  const file = useRef<HTMLInputElement>(null);
  const currentValue = useRef(value); currentValue.current = value;
  const importing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const box = selectionBounds(value, selection);
  const locked = disabled || busy;
  const apply = (label: string, change: () => VectorDocument) => {
    try { const after = change(); setMessage(''); if (JSON.stringify(value) !== JSON.stringify(after)) onCommit({ before: value, after, label }); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The change could not be applied.'); }
  };
  const setDimension = (dimension: 'x' | 'y' | 'width' | 'height', next: number) => {
    if (!box || !Number.isFinite(next)) return;
    apply(`Set selection ${dimension}`, () => dimension === 'x' || dimension === 'y'
      ? translateSelection(value, selection, dimension === 'x' ? next - box.x : 0, dimension === 'y' ? next - box.y : 0)
      : resizeSelection(value, selection, dimension === 'width' ? next : box.width, dimension === 'height' ? next : box.height));
  };
  return <section data-testid="vector-tools-panel" aria-label="Vector tools" style={{ display: 'grid', gap: 12, fontSize: 12 }}>
    <div role="toolbar" aria-label="Vector editing tools" style={{ display: 'flex', gap: 6 }}>
      <button type="button" style={vectorControlStyle} data-testid="vector-tool-select" aria-pressed={tool === 'select'} title="Select and transform objects (V)" disabled={locked || !onToolChange} onClick={() => onToolChange?.('select')}>Select</button>
      <button type="button" style={vectorControlStyle} data-testid="vector-tool-node" aria-pressed={tool === 'node'} title="Edit path nodes (A)" disabled={locked || !onToolChange} onClick={() => onToolChange?.('node')}>Edit nodes</button>
    </div>
    <fieldset disabled={locked || !box} data-testid="vector-transform-panel" style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
      <legend style={{ fontWeight: 600, marginBottom: 8 }}>Transform selection</legend>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(['x', 'y', 'width', 'height'] as const).map(key => <label key={key} style={{ display: 'grid', gap: 4 }}>{key === 'x' || key === 'y' ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1)}
          <input key={`${key}:${box?.[key]}`} style={vectorControlStyle} aria-label={`Selection ${key}`} data-testid={`vector-transform-${key}`} type="number" step="any" min={key === 'width' || key === 'height' ? 0.001 : undefined} defaultValue={box ? +box[key].toFixed(3) : ''}
            onBlur={e => { if (e.currentTarget.value !== '') setDimension(key, Number(e.currentTarget.value)); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        </label>)}
      </div>
      <label style={{ display: 'grid', gap: 4 }}>Rotate by degrees<input type="number" step="any" defaultValue={0} style={vectorControlStyle} aria-label="Rotate selection by degrees" data-testid="vector-transform-rotation"
        onBlur={e => { const degrees = Number(e.currentTarget.value); if (degrees) apply('Rotate selection', () => rotateSelection(value, selection, degrees)); e.currentTarget.value = '0'; }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button type="button" style={vectorControlStyle} data-testid="vector-flip-horizontal" onClick={() => box && apply('Flip horizontally', () => scaleSelection(value, selection, -1, 1, { x: box.x + box.width / 2, y: box.y + box.height / 2 }))}>Flip horizontal</button>
        <button type="button" style={vectorControlStyle} data-testid="vector-flip-vertical" onClick={() => box && apply('Flip vertically', () => scaleSelection(value, selection, 1, -1, { x: box.x + box.width / 2, y: box.y + box.height / 2 }))}>Flip vertical</button>
        <button type="button" style={vectorControlStyle} data-testid="vector-delete-selection" onClick={() => { apply('Delete selection', () => deleteSelection(value, selection)); onSelectionChange([]); }}>Delete selection</button>
      </div>
    </fieldset>
    <p style={{ margin: 0, opacity: 0.65 }}>{box ? `${selection.length} selected. Dimensions are in document pixels.` : 'Select an object to move, resize or rotate it.'}</p>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <input ref={file} type="file" accept=".svg,image/svg+xml" aria-label="SVG file" data-testid="vector-svg-file" hidden disabled={locked} onChange={async e => {
        const selected = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (!selected || locked || importing.current) return;
        importing.current = true; setBusy(true); setMessage('');
        try { const { doc, warnings } = await readSvgFile(selected); if (currentValue.current !== value) throw new Error('The document changed while opening SVG. Open the file again to avoid overwriting edits.'); onCommit({ before: value, after: doc, label: `Open ${selected.name}` }); onSelectionChange([]); setMessage(warnings.map(w => w.message).join(' ')); }
        catch (error) { setMessage(error instanceof SvgImportError ? [error.message, ...error.diagnostics.map(d => d.message)].join(' ') : error instanceof Error ? error.message : 'SVG could not be opened.'); }
        finally { importing.current = false; setBusy(false); }
      }} />
      <button type="button" data-testid="vector-import-svg" style={vectorControlStyle} disabled={locked} title="Open SVG as the current document. Undo restores the previous document." onClick={() => file.current?.click()}>{busy ? 'Opening SVG...' : 'Open SVG'}</button>
      <button type="button" data-testid="vector-export-svg" style={vectorControlStyle} disabled={locked} onClick={() => { try { if (onExport) onExport(value); else downloadSvg(value, exportName); setMessage(''); } catch (error) { setMessage(error instanceof Error ? error.message : 'SVG could not be exported.'); } }}>Export SVG</button>
    </div>
    {message && <p role="status" data-testid="vector-io-status" style={{ margin: 0, overflowWrap: 'anywhere' }}>{message}</p>}
  </section>;
}
