import type {PointerEvent as RPointerEvent} from 'react';
import type {GuideAxis} from '../../lib/vectorstudio/guideOps';
export const RULER_PX=16;
/** A readable tick step (1, 2, 5 x 10^k document units) that keeps labels at least ~60 screen px apart. */
export function tickStep(zoom:number):number{
 const want=60/Math.max(zoom,1e-6),k=Math.pow(10,Math.floor(Math.log10(want)));
 for(const m of [1,2,5,10])if(m*k>=want)return m*k;
 return 10*k;
}
interface Props{zoom:number;pan:{x:number;y:number};width:number;height:number;onStart:(axis:GuideAxis,e:RPointerEvent)=>void;onMove:(e:RPointerEvent)=>void;onEnd:(e:RPointerEvent)=>void;onCancel:()=>void;label:string}
const MAX_TICKS=400;
/** Rulers along the top and left edge of the canvas. Pressing on one and dragging pulls out a guide (top ruler: horizontal guide, left ruler: vertical guide). */
export function VectorRulers({zoom,pan,width,height,onStart,onMove,onEnd,onCancel,label}:Props){
 const step=tickStep(zoom),ticks=(len:number,off:number)=>{const lo=Math.floor(-off/zoom/step),hi=Math.ceil((len-off)/zoom/step),out:number[]=[];for(let i=lo;i<=hi&&out.length<MAX_TICKS;i++)out.push(i*step);return out;};
 return <>
  <svg className="absolute left-0 top-0 h-4 w-full cursor-row-resize touch-none select-none border-b border-line bg-elevated text-ink-3" data-testid="vector-ruler-top" aria-label={label} onPointerDown={e=>onStart('y',e)} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onCancel}>
   {ticks(width,pan.x).map(v=><g key={v}><line x1={pan.x+v*zoom} x2={pan.x+v*zoom} y1={9} y2={RULER_PX} stroke="currentColor" strokeWidth={1}/><text x={pan.x+v*zoom+2} y={8} className="fill-current" fontSize={8}>{Math.round(v*1000)/1000}</text></g>)}
  </svg>
  <svg className="absolute left-0 top-0 h-full w-4 cursor-col-resize touch-none select-none border-r border-line bg-elevated text-ink-3" data-testid="vector-ruler-left" aria-label={label} onPointerDown={e=>onStart('x',e)} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onCancel}>
   {ticks(height,pan.y).map(v=><g key={v}><line y1={pan.y+v*zoom} y2={pan.y+v*zoom} x1={9} x2={RULER_PX} stroke="currentColor" strokeWidth={1}/><text x={9} y={pan.y+v*zoom-2} className="fill-current" fontSize={8} transform={`rotate(-90 9 ${pan.y+v*zoom-2})`}>{Math.round(v*1000)/1000}</text></g>)}
  </svg>
 </>;
}
