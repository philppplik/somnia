import {useRef,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent} from 'react';
import {animationSession} from '../../lib/animation/session';
import {bezierPath,maskEdit,resolveMask} from '../../lib/animation/masks';
import {corners,maskBox,moveBox,resizeBox,type BoxHandle} from '../../lib/animation/maskHandles';
import {activeMask,useMaskSelection} from '../../lib/animation/maskSelection';
import type {Composition,Layer,LayerMask,Vec2} from '../../lib/animation/model';
import {worldMatrix} from '../../lib/animation/scene';
import {useT} from '../../lib/useT';
type Op=Parameters<typeof maskEdit>[2];
/** On-canvas handles of the selected mask: outline drags the mask, corners resize rect/ellipse, points move a path. One drag is one undo step. */
export function MaskOverlay({comp,layer,at}:{comp:Composition;layer:Layer;at:number}){
 const {t}=useT();const sel=useMaskSelection();const gRef=useRef<SVGGElement>(null);const sess=animationSession();
 const stored=activeMask(layer,sel);if(!stored||layer.kind==='null'||layer.kind==='audio')return null;
 const m=resolveMask(stored,at),locked=layer.locked;
 const scale=()=>{const c=gRef.current?.getScreenCTM();return c?1/Math.max(1e-6,Math.sqrt(Math.abs(c.a*c.d-c.b*c.c))):1;};
 const toLocal=(cx:number,cy:number):Vec2=>{const c=gRef.current!.getScreenCTM()!.inverse();const pt=new DOMPoint(cx,cy).matrixTransform(c);return [pt.x,pt.y];};
 const edit=(o:Op)=>maskEdit(sess.document!,layer.id,o);
 const drag=(e:PointerEvent<SVGElement>,ops:(dx:number,dy:number,p:Vec2)=>Op[])=>{
  if(e.button!==0||locked)return;e.stopPropagation();const el=e.currentTarget;el.setPointerCapture(e.pointerId);
  const start=toLocal(e.clientX,e.clientY);let moved=false;
  const mv=(ev:globalThis.PointerEvent)=>{const p=toLocal(ev.clientX,ev.clientY);if(!moved&&Math.hypot(ev.clientX-e.clientX,ev.clientY-e.clientY)<3)return;
   try{sess.previewEdits(ops(p[0]-start[0],p[1]-start[1],p).map(edit));moved=true;}catch{/* range or stale: keep last valid preview */}};
  const done=(commit:boolean)=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);if(moved&&commit)sess.commitPreview();else sess.cancelPreview();};
  const up=()=>done(true);const esc=(ev:globalThis.KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();done(false);}};
  el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
 };
 const box=maskBox(m);
 const boxOp=(b:{x:number;y:number;width:number;height:number}):Op=>m.shape==='path'?{op:'set',mask:m.id,prop:'position',value:[b.x-(box.x-m.x),b.y-(box.y-m.y)],t:at}:{op:'box',mask:m.id,...b,t:at};
 const nudge=(apply:(dx:number,dy:number)=>void)=>(e:ReactKeyboardEvent<SVGElement>)=>{
  const dx=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0,dy=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0;if(!dx&&!dy)return;
  e.preventDefault();e.stopPropagation();const s=e.shiftKey?10:1;try{apply(dx*s,dy*s);}catch{/* stale */}
 };
 const k=scale(),r=5*k,outline=m.shape==='path'&&m.path?bezierPath(m.path,m.x,m.y):m.shape==='rect'?`M${m.x} ${m.y}h${m.width}v${m.height}h${-m.width}Z`:`M${m.x} ${m.y+m.height/2}a${m.width/2} ${m.height/2} 0 1 0 ${m.width} 0a${m.width/2} ${m.height/2} 0 1 0 ${-m.width} 0Z`;
 const common={fill:'var(--bg-elevated)',stroke:'var(--accent)',strokeWidth:2*k,tabIndex:locked?-1:0,role:'slider' as const,className:`touch-none ${locked?'cursor-default':'cursor-grab'}`};
 const label=(m2:LayerMask)=>t('animation.masks.item',{n:(layer.masks??[]).findIndex(x=>x.id===m2.id)+1});
 return <g ref={gRef} transform={`matrix(${worldMatrix(comp,layer,at).join(' ')})`} data-testid="animation-mask-overlay" role="group" aria-label={label(m)}>
  <path d={outline} fill="none" stroke="rgba(0,0,0,.55)" strokeWidth={4*k} strokeLinejoin="round" pointerEvents="none"/>
  <path d={outline} fill="none" stroke="var(--accent)" strokeWidth={2*k} strokeDasharray={`${6*k} ${4*k}`} strokeLinejoin="round" pointerEvents={locked?'none':'stroke'} className={locked?'cursor-default':'cursor-move'} data-testid="animation-mask-outline"
   onPointerDown={e=>drag(e,(dx,dy)=>[boxOp(moveBox(box,dx,dy))])}/>
  {m.shape!=='path'&&(Object.entries(corners(box)) as [BoxHandle,[number,number]][]).map(([h,[cx,cy]])=>
   <rect key={h} x={cx-r} y={cy-r} width={2*r} height={2*r} {...common} aria-label={t('animation.masks.handle',{corner:h.toUpperCase()})} aria-valuetext={`${Math.round(box.width)} × ${Math.round(box.height)}`} data-testid={`animation-mask-handle-${h}`}
    onPointerDown={e=>drag(e,(dx,dy)=>[boxOp(resizeBox(box,h,dx,dy))])}
    onKeyDown={locked?undefined:nudge((dx,dy)=>sess.dispatch(edit(boxOp(resizeBox(box,h,dx,dy)))))}/>)}
  {m.shape==='path'&&m.path?.points.map((q,i)=>
   <circle key={i} cx={m.x+q.x} cy={m.y+q.y} r={r} {...common} aria-label={t('animation.masks.point',{n:i+1})} aria-valuetext={`${Math.round(q.x)}, ${Math.round(q.y)}`} data-testid="animation-mask-point"
    onPointerDown={e=>drag(e,(_dx,_dy,p)=>[{op:'point',mask:m.id,index:i,x:p[0]-m.x,y:p[1]-m.y}])}
    onKeyDown={locked?undefined:nudge((dx,dy)=>sess.dispatch(edit({op:'point',mask:m.id,index:i,x:q.x+dx,y:q.y+dy})))}/>)}
 </g>;
}
