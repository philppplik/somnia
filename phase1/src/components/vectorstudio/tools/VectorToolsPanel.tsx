import {reportError} from '../../../lib/log';
import { useRef, useState } from 'react';
import type { VectorDocument } from '../../../lib/vectorio';
import { SvgImportError } from '../../../lib/vectorio';
import { deleteSelection, resizeSelection, rotateSelection, scaleSelection, selectionBounds, translateSelection, type VectorTool, type VectorToolCommit } from './operations';
import { downloadSvg, readSvgFile } from './svgIO';
import {NativeButton,NativeInput} from '../../ui/native-controls';
/** Shared geometry for the tools and node panel controls (token paint, DS panel look). */
export const vectorControlClass = 'min-w-0 rounded-[8px] border border-line bg-surface px-2 py-1.5 text-xs text-ink';
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
    catch (error) {reportError('vector.operation',error,{context:{studio:'vector'}}); setMessage(error instanceof Error ? error.message : 'The change could not be applied.'); }
  };
  const setDimension = (dimension: 'x' | 'y' | 'width' | 'height', next: number) => {
    if (!box || !Number.isFinite(next)) return;
    apply(`Set selection ${dimension}`, () => dimension === 'x' || dimension === 'y'
      ? translateSelection(value, selection, dimension === 'x' ? next - box.x : 0, dimension === 'y' ? next - box.y : 0)
      : resizeSelection(value, selection, dimension === 'width' ? next : box.width, dimension === 'height' ? next : box.height));
  };
  return <section data-testid="vector-tools-panel" aria-label="Vector tools" className="grid gap-3 text-xs">
    <div role="toolbar" aria-label="Vector editing tools" className="flex gap-1.5">
      <NativeButton type="button" className={vectorControlClass} data-testid="vector-tool-select" aria-pressed={tool === 'select'} title="Select and transform objects (V)" disabled={locked || !onToolChange} onClick={() => onToolChange?.('select')}>Select</NativeButton>
      <NativeButton type="button" className={vectorControlClass} data-testid="vector-tool-node" aria-pressed={tool === 'node'} title="Edit path nodes (A)" disabled={locked || !onToolChange} onClick={() => onToolChange?.('node')}>Edit nodes</NativeButton>
    </div>
    <fieldset disabled={locked || !box} data-testid="vector-transform-panel" className="m-0 grid gap-2 border-0 p-0">
      <legend className="mb-2 font-semibold">Transform selection</legend>
      <div className="grid grid-cols-2 gap-2">
        {(['x', 'y', 'width', 'height'] as const).map(key => <label key={key} className="grid gap-1">{key === 'x' || key === 'y' ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1)}
          <NativeInput key={`${key}:${box?.[key]}`} className={vectorControlClass} aria-label={`Selection ${key}`} data-testid={`vector-transform-${key}`} type="number" step="any" min={key === 'width' || key === 'height' ? 0.001 : undefined} defaultValue={box ? +box[key].toFixed(3) : ''}
            onBlur={e => { if (e.currentTarget.value !== '') setDimension(key, Number(e.currentTarget.value)); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        </label>)}
      </div>
      <label className="grid gap-1">Rotate by degrees<NativeInput type="number" step="any" defaultValue={0} className={vectorControlClass} aria-label="Rotate selection by degrees" data-testid="vector-transform-rotation"
        onBlur={e => { const degrees = Number(e.currentTarget.value); if (degrees) apply('Rotate selection', () => rotateSelection(value, selection, degrees)); e.currentTarget.value = '0'; }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
      <div className="flex flex-wrap gap-1.5">
        <NativeButton type="button" className={vectorControlClass} data-testid="vector-flip-horizontal" onClick={() => box && apply('Flip horizontally', () => scaleSelection(value, selection, -1, 1, { x: box.x + box.width / 2, y: box.y + box.height / 2 }))}>Flip horizontal</NativeButton>
        <NativeButton type="button" className={vectorControlClass} data-testid="vector-flip-vertical" onClick={() => box && apply('Flip vertically', () => scaleSelection(value, selection, 1, -1, { x: box.x + box.width / 2, y: box.y + box.height / 2 }))}>Flip vertical</NativeButton>
        <NativeButton type="button" className={vectorControlClass} data-testid="vector-delete-selection" onClick={() => { apply('Delete selection', () => deleteSelection(value, selection)); onSelectionChange([]); }}>Delete selection</NativeButton>
      </div>
    </fieldset>
    <p className="m-0 opacity-65">{box ? `${selection.length} selected. Dimensions are in document pixels.` : 'Select an object to move, resize or rotate it.'}</p>
    <div className="flex flex-wrap gap-1.5">
      <NativeInput ref={file} type="file" accept=".svg,image/svg+xml" aria-label="SVG file" data-testid="vector-svg-file" hidden disabled={locked} onChange={async e => {
        const selected = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (!selected || locked || importing.current) return;
        importing.current = true; setBusy(true); setMessage('');
        try { const { doc, warnings } = await readSvgFile(selected); if (currentValue.current !== value) throw new Error('The document changed while opening SVG. Open the file again to avoid overwriting edits.'); onCommit({ before: value, after: doc, label: `Open ${selected.name}` }); onSelectionChange([]); setMessage(warnings.map(w => w.message).join(' ')); }
        catch (error) {reportError('vector.operation',error,{context:{studio:'vector'}}); setMessage(error instanceof SvgImportError ? [error.message, ...error.diagnostics.map(d => d.message)].join(' ') : error instanceof Error ? error.message : 'SVG could not be opened.'); }
        finally { importing.current = false; setBusy(false); }
      }} />
      <NativeButton type="button" data-testid="vector-import-svg" className={vectorControlClass} disabled={locked} title="Open SVG as the current document. Undo restores the previous document." onClick={() => file.current?.click()}>{busy ? 'Opening SVG...' : 'Open SVG'}</NativeButton>
      <NativeButton type="button" data-testid="vector-export-svg" className={vectorControlClass} disabled={locked} onClick={() => { try { if (onExport) onExport(value); else downloadSvg(value, exportName); setMessage(''); } catch (error) {reportError('vector.operation',error,{context:{studio:'vector'}}); setMessage(error instanceof Error ? error.message : 'SVG could not be exported.'); } }}>Export SVG</NativeButton>
    </div>
    {message && <p role="status" data-testid="vector-io-status" className="m-0 [overflow-wrap:anywhere]">{message}</p>}
  </section>;
}
