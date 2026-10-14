import {useAnimationState} from '../../lib/animation/session';
import {normalizeOverlays,overlayLines,safeRects,type Line} from '../../lib/animation/guides';
import type {Composition} from '../../lib/animation/model';
const draw=(lines:readonly Line[],cls:string,key:string)=>lines.map((l,i)=><line key={`${key}${i}`} {...l} className={cls} stroke="currentColor" vectorEffect="non-scaling-stroke"/>);
/** Viewer-only overlays: safe areas, centre cross, thirds, grid and the composition's ruler guides. Never part of any export. */
export function ViewerGuides({comp}:{comp:Composition}){
 const o=normalizeOverlays(useAnimationState().view.overlays);const g=comp.guides??[];
 if(!g.length&&!Object.values(o).some(Boolean))return null;
 const {grid,thirds,center}=overlayLines(comp.width,comp.height,o),{action,title}=safeRects(comp.width,comp.height);
 return <g pointerEvents="none" data-testid="animation-viewer-guides" fill="none">
  {draw(grid,'text-ink-3 opacity-40','g')}{draw(thirds,'text-ink-2 opacity-70','t')}{draw(center,'text-ink-2 opacity-70','c')}
  {o.safe&&<><rect {...action} className="text-warning" stroke="currentColor" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" data-testid="animation-safe-action"/><rect {...title} className="text-accent" stroke="currentColor" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" data-testid="animation-safe-title"/></>}
  {draw(g.map(x=>x.axis==='x'?{x1:x.at,y1:0,x2:x.at,y2:comp.height}:{x1:0,y1:x.at,x2:comp.width,y2:x.at}),'text-accent','u')}
 </g>;
}
