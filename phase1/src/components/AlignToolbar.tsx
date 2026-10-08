import {useUiContext} from '../lib/uiContextStore';
import type {RefObject} from 'react';
import {useAppStore} from '../store/appStore';
import {alignSelection, distributeSelection, lockedIds} from '../lib/alignApply';
import type {AlignMode, Axis} from '../lib/alignDistribute';

/** Tiny glyphs: two bars plus a reference line, drawn per action. */
const Glyph = ({d}: {d: string}) => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d={d}/></svg>;
const ALIGN: Array<[AlignMode, string, string]> = [
  ['left', 'Align left', 'M2 2v12M5 4h8M5 10h5'],
  ['hcenter', 'Align horizontal centers', 'M8 2v12M3 4h10M5 10h6'],
  ['right', 'Align right', 'M14 2v12M3 4h8M6 10h5'],
  ['top', 'Align top', 'M2 2h12M4 5v8M10 5v5'],
  ['vmiddle', 'Align vertical middles', 'M2 8h12M4 3v10M10 5v6'],
  ['bottom', 'Align bottom', 'M2 14h12M4 3v8M10 6v5']];
const DISTRIBUTE: Array<[Axis, string, string]> = [
  ['h', 'Distribute horizontally', 'M2 2v12M14 2v12M6 5v6M10 5v6'],
  ['v', 'Distribute vertically', 'M2 2h12M2 14h12M5 6h6M5 10h6']];

/** Shown when two or more elements are selected. Distribute needs three. Locked elements are skipped. */
export function AlignToolbar({frame}: {frame: RefObject<HTMLIFrameElement | null>}) {
  const s = useAppStore();const context=useUiContext();
  const locked = lockedIds(s.nodes);
  const ids = s.selectedElementIds.filter(id => !locked.has(id));
  if (context.domain!=='web'||context.surface==='code'||context.selection.kind!=='multi') return null;
  return <div role="toolbar" aria-label="Align and distribute" className="align-toolbar">
    {ALIGN.map(([mode, label, d]) => <button key={mode} type="button" title={label} aria-label={label} disabled={ids.length < 2} onClick={() => alignSelection(frame.current, mode)}><Glyph d={d}/></button>)}
    <span className="align-sep" aria-hidden="true"/>
    {DISTRIBUTE.map(([axis, label, d]) => <button key={axis} type="button" title={label} aria-label={label} disabled={ids.length < 3} onClick={() => distributeSelection(frame.current, axis)}><Glyph d={d}/></button>)}
  </div>;
}
