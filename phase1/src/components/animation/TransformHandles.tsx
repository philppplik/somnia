import type {Composition,Layer} from '../../lib/animation/model';
import {handleSet,type SizedAsset} from '../../lib/animation/handles';
import {startHandleDrag} from './handleDrag';
import {useT} from '../../lib/useT';
/** Viewer-only box with four scale handles and a rotate handle for the selected layer. Never exported. */
export function TransformHandles({comp,layer,at,assets}:{comp:Composition;layer:Layer|undefined;at:number;assets:readonly SizedAsset[]}){
 const {t}=useT();if(!layer||layer.locked)return null;const hs=handleSet(comp,layer,at,assets);if(!hs)return null;
 const r=Math.max(5,comp.width/130),c=hs.corners,mid:readonly [number,number]=[(c[0][0]+c[1][0])/2,(c[0][1]+c[1][1])/2];
 return <g data-testid="animation-transform-handles" className="text-accent">
  <polygon points={c.map(p=>p.join(',')).join(' ')} fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
  <line x1={mid[0]} y1={mid[1]} x2={hs.rotate[0]} y2={hs.rotate[1]} stroke="currentColor" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
  {c.map((p,i)=><rect key={i} x={p[0]-r/2} y={p[1]-r/2} width={r} height={r} className="cursor-nwse-resize fill-accent-fill" stroke="currentColor" vectorEffect="non-scaling-stroke"
   role="presentation" aria-label={t('animation.handles.scale')} data-testid={`animation-handle-scale-${i}`} onPointerDown={e=>startHandleDrag(e,'scale',comp,layer,at,assets,i)}><title>{t('animation.handles.scale')}</title></rect>)}
  <circle cx={hs.rotate[0]} cy={hs.rotate[1]} r={r/2+1} className="cursor-grab fill-accent-fill" stroke="currentColor" vectorEffect="non-scaling-stroke" data-testid="animation-handle-rotate"
   onPointerDown={e=>startHandleDrag(e,'rotate',comp,layer,at,assets)}><title>{t('animation.handles.rotate')}</title></circle>
 </g>;
}
