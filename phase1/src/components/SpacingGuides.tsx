import {useEffect, useLayoutEffect, useState, type RefObject} from 'react';
import {useAppStore} from '../store/appStore';
import {measureSelection} from '../lib/alignApply';
import {edgeGuides, gapGuides, type Box} from '../lib/alignDistribute';

/** Overlay inside the scaled canvas: shared edges and the pixel gaps between selected elements. Pointer-transparent. */
export function SpacingGuides({frame, scale}: {frame: RefObject<HTMLIFrameElement | null>; scale: number}) {
  const s = useAppStore();
  const [boxes, setBoxes] = useState<Box[]>([]);
  useLayoutEffect(() => { setBoxes(s.selectedElementIds.length > 1 ? measureSelection(frame.current) : []); }, [s.selectedElementIds, s.revision, s.zoom, s.viewport, s.viewportHeight, frame]);
  // The preview iframe reloads after each edit; measure again once it has painted the new layout.
  useEffect(() => {
    const el = frame.current;
    if (!el || s.selectedElementIds.length < 2) return;
    const again = () => setBoxes(measureSelection(el));
    el.addEventListener('load', again);
    const t = setTimeout(again, 60);
    return () => { el.removeEventListener('load', again); clearTimeout(t); };
  }, [s.selectedElementIds, s.revision, s.zoom, s.viewport, frame]);
  if (boxes.length < 2) return null;
  const font = 11 / scale, line = 1 / scale;
  const gaps = gapGuides(boxes), edges = edgeGuides(boxes);
  const color = 'var(--canvas-danger)';
  return <div data-testid="spacing-guides" aria-hidden="true" style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:3}}>
    {edges.map((g, i) => g.axis === 'x'
      ? <div key={`e${i}`} data-guide="edge-x" style={{position:'absolute',left:g.pos,top:0,bottom:0,width:line,background:'var(--canvas-accent)',opacity:.7}}/>
      : <div key={`e${i}`} data-guide="edge-y" style={{position:'absolute',top:g.pos,left:0,right:0,height:line,background:'var(--canvas-accent)',opacity:.7}}/>)}
    {gaps.map((g, i) => {
      const horizontal = g.axis === 'h';
      const box = horizontal ? {left: g.from, top: g.at, width: g.to - g.from, height: line} : {left: g.at, top: g.from, width: line, height: g.to - g.from};
      return <div key={`g${i}`} data-guide="gap" data-gap={g.gap} data-equal={g.equal} style={{position:'absolute',background:g.equal?'var(--canvas-ok)':color,...box}}>
        <span style={{position:'absolute',left:horizontal?'50%':font,top:horizontal?-font*1.6:'50%',transform:horizontal?'translateX(-50%)':'translateY(-50%)',font:`${font}px system-ui`,background:g.equal?'var(--canvas-ok)':color,color:'var(--canvas-badge-fg)',padding:`${font*0.1}px ${font*0.35}px`,borderRadius:font*0.3,whiteSpace:'nowrap'}}>{g.equal?'= ':''}{Math.round(g.gap)}</span>
      </div>;
    })}
  </div>;
}
