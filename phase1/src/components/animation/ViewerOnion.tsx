import {useMemo} from 'react';
import {useAnimationState} from '../../lib/animation/session';
import {normalizeOnion,ghostFrames,layerOnlyComp} from '../../lib/animation/onion';
import {frameSvg} from '../../lib/animation/exportFrames';
import type {Composition} from '../../lib/animation/model';
import type {InterfaceAsset} from '../../lib/interface/schema';
/** Viewer-only ghost frames behind the live frame: earlier frames cool, later frames warm. Never part of any export. */
export function ViewerOnion({comp,at,assets,comps}:{comp:Composition;at:number;assets:readonly InterfaceAsset[];comps:readonly Composition[]}){
 const o=normalizeOnion(useAnimationState().view.onion);
 const ghosts=useMemo(()=>ghostFrames(o,at,comp.fps,comp.duration),[o.on,o.before,o.after,o.step,o.opacity,at,comp.fps,comp.duration]);
 const selected=useAnimationState().view.selectedLayer;
 if(!ghosts.length)return null;
 const src=o.selectedOnly?layerOnlyComp(comp,selected):comp;
 return <g pointerEvents="none" data-testid="animation-viewer-onion">
  <defs>
   <filter id="onion-before" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0.4 0 0 0 0  0 0.7 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter>
   <filter id="onion-after" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 0.7 0 0 0  0 0 0.4 0 0  0 0 0 1 0"/></filter>
  </defs>
  {ghosts.map(g=><image key={`${g.side}${g.n}`} href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(frameSvg(src,g.tick,true,assets,comps))}`} width={comp.width} height={comp.height} opacity={g.opacity} filter={o.tint?`url(#onion-${g.side})`:undefined} data-ghost={`${g.side}${g.n}`}/>)}
 </g>;
}
