import { useMemo, useRef, useState } from 'react';
import type { RasterImage } from '../../lib/image/buffer';
import type { ImageOperation, Point, Viewport } from '../../lib/image-editor/types';
import { combineSelections, copySelection, emptySelection, lassoSelection, rectSelection, selectionBounds, selectionCutOp, selectionFillOp, wandSelection, type SelectionMask, type SelectionMode } from '../../lib/imgedit/select';
import { ImageEditorViewport } from '../ImageEditorViewport';
import { SelectionOverlay } from './SelectionOverlay';
export interface SelectionEditorProps {
  image: HTMLCanvasElement | null;
  /** Raster must be the current rendered stack. Parent clears selection after dimension-changing edits. */
  raster: RasterImage;
  selection: SelectionMask | null;
  onSelectionChange(selection: SelectionMask | null): void;
  onCommit(op: ImageOperation): void;
  /** Optional bridge to the host's clipboard. Without it, payload is kept locally in this panel. */
  onCopy?(payload: NonNullable<ReturnType<typeof copySelection>>): void;
  viewport?: Viewport;
  onViewportChange?(viewport: Viewport): void;
  disabled?: boolean;
}
type Tool = 'rect' | 'lasso' | 'wand';
export function SelectionEditor(p: SelectionEditorProps) {
  const [tool, setTool] = useState<Tool>('rect'), [mode, setMode] = useState<SelectionMode>('replace'), [tolerance, setTolerance] = useState(24);
  const [color, setColor] = useState('#8855ee'), [alpha, setAlpha] = useState(255), [preview, setPreview] = useState<SelectionMask | null>(null);
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, zoom: 1 }), [copied, setCopied] = useState(false);
  const clipboard = useRef<ReturnType<typeof copySelection>>(null);
  const gesture = useRef<{ id: number; start: Point; points: Point[]; base: SelectionMask; mode: SelectionMode; tool: Tool } | null>(null);
  const valid = p.selection?.width === p.raster.width && p.selection.height === p.raster.height ? p.selection : null;
  const hasSelection = useMemo(() => !!valid && !!selectionBounds(valid), [valid]);
  const reset = () => { gesture.current = null; setPreview(null); };
  const shape = (point: Point, append: boolean) => {
    const g = gesture.current; if (!g) return null;
    if (append && (g.points.at(-1)!.x !== point.x || g.points.at(-1)!.y !== point.y)) g.points.push(point);
    const next = g.tool === 'rect' ? rectSelection(p.raster.width, p.raster.height, g.start, point) : lassoSelection(p.raster.width, p.raster.height, g.points);
    return combineSelections(g.base, next, g.mode);
  };
  const copy = () => {
    if (!valid) return; const payload = copySelection(p.raster, valid); if (!payload) return;
    clipboard.current = payload; p.onCopy?.(payload); setCopied(true);
  };
  return <section aria-label="Image selection editor" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}
    onKeyDown={event => { if (event.key === 'Escape') { reset(); p.onSelectionChange(null); } }}>
    <fieldset disabled={p.disabled} aria-label="Selection tools" className="flex flex-wrap items-center gap-2 border-0 p-2 text-xs">
      <label>Tool <select aria-label="Selection tool" value={tool} onChange={e => { reset(); setTool(e.target.value as Tool); }}>
        <option value="rect">Rectangle</option><option value="lasso">Freehand lasso</option><option value="wand">Magic wand</option>
      </select></label>
      <label>Mode <select aria-label="Selection mode" value={mode} onChange={e => setMode(e.target.value as SelectionMode)}>
        <option value="replace">Replace</option><option value="add">Add</option><option value="subtract">Subtract</option><option value="intersect">Intersect</option>
      </select></label>
      {tool === 'wand' && <label>Tolerance <input aria-label="Color tolerance" type="number" min={0} max={255} value={tolerance} onChange={e => { const value = e.target.valueAsNumber; if (Number.isFinite(value)) setTolerance(Math.max(0, Math.min(255, value))); }} /></label>}
      <button type="button" disabled={!hasSelection} onClick={copy}>Copy</button>
      <button type="button" disabled={!hasSelection} onClick={() => { copy(); if (valid) p.onCommit(selectionCutOp(valid)); }}>Cut</button>
      <input type="color" aria-label="Selection fill color" value={color} onChange={e => setColor(e.target.value)} />
      <label>Alpha <input type="number" aria-label="Selection fill alpha" min={0} max={255} value={alpha} onChange={e => { const value = e.target.valueAsNumber; if (Number.isFinite(value)) setAlpha(Math.round(Math.max(0, Math.min(255, value)))); }} /></label>
      <button type="button" disabled={!hasSelection} onClick={() => { if (valid) p.onCommit(selectionFillOp(valid, [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), alpha])); }}>Fill</button>
      <button type="button" disabled={!valid} onClick={() => { reset(); p.onSelectionChange(null); }}>Deselect</button>
      <span role="status">{copied ? 'Selection copied' : ''}</span>
    </fieldset>
    <div style={{ flex: 1, minHeight: 0 }}>
      <ImageEditorViewport image={p.image} viewport={p.viewport} onViewportChange={v => { setView(v); p.onViewportChange?.(v); }}
        overlay={<SelectionOverlay selection={preview ?? valid} viewport={p.viewport ?? view} />}
        onImagePointer={(point, event) => {
          if (p.disabled) return; setCopied(false);
          const base = valid ?? emptySelection(p.raster.width, p.raster.height);
          const gestureMode = event.shiftKey && event.ctrlKey ? 'intersect' : event.shiftKey ? 'add' : event.ctrlKey || event.metaKey ? 'subtract' : mode;
          if (tool === 'wand') { p.onSelectionChange(combineSelections(base, wandSelection(p.raster, point, tolerance), gestureMode)); return; }
          gesture.current = { id: event.pointerId, start: point, points: [point], base, mode: gestureMode, tool };
        }}
        onImagePointerMove={(point, event) => { if (p.disabled) { reset(); return; } if (gesture.current?.id === event.pointerId) setPreview(shape(point, true)); }}
        onImagePointerUp={(point, event) => { if (p.disabled) { reset(); return; } if (gesture.current?.id !== event.pointerId) return; const result = shape(point, true); reset(); p.onSelectionChange(result); }}
        onImagePointerCancel={reset} />
    </div>
  </section>;
}
