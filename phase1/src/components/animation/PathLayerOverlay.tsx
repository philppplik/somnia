import {useEffect,useRef,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent} from 'react';
import {animationSession} from '../../lib/animation/session';
import {bezierPath} from '../../lib/animation/masks';
import {newId,type Composition,type Layer,type MaskPath,type Vec2} from '../../lib/animation/model';
import {pathLayerEdit,pathLayerMoveEdit,penNewLayerEdit,type PathLayerOp} from '../../lib/animation/pathLayer';
import {setLayerPen,setLayerPoint,useMaskSelection} from '../../lib/animation/maskSelection';
import type {Edit} from '../../lib/animation/edit';
import {worldMatrix} from '../../lib/animation/scene';
import {lerpPath} from '../../lib/animation/masks';
import {useT} from '../../lib/useT';
/** Nearest point on the path outline (local pixels): segment index and curve parameter. */
function nearest(p:MaskPath,w:number,h:number,at:Vec2):{i:number;u:number}|null{
 const n=p.points.length,segs=p.closed?n:n-1;let best:{i:number;u:number}|null=null,bd=Infinity;
 for(let i=0;i<segs;i++){const a=p.points[i],b=p.points[(i+1)%n],c=[[a.x*w,a.y*h],[(a.x+(a.outX??0))*w,(a.y+(a.outY??0))*h],[(b.x+(b.inX??0))*w,(b.y+(b.inY??0))*h],[b.x*w,b.y*h]];
  for(let k=0;k<=24;k++){const u=k/24,v=1-u,wt=[v*v*v,3*v*v*u,3*v*u*u,u*u*u],x=c.reduce((r,q,j)=>r+q[0]*wt[j],0),y=c.reduce((r,q,j)=>r+q[1]*wt[j],0),d=Math.hypot(x-at[0],y-at[1]);if(d<bd){bd=d;best={i,u};}}}
 return best;
}
const isPath=(l?:Layer):l is Layer=>!!l&&l.kind==='shape'&&l.source.shape==='path'&&!!l.source.path;
/** Pen drawing and handle dragging for path shape layers. A click adds a point, a drag pulls symmetric handles, a click on the first point closes the path, Esc or Enter finishes. Every click or drag is one undo step (hover state lives in the session preview). */
export function PathLayerOverlay({comp,layer,at}:{comp:Composition;layer?:Layer;at:number}){
 const {t}=useT();const sel=useMaskSelection();const gRef=useRef<SVGGElement>(null);const sess=animationSession();const point=sel.layerPoint&&layer&&sel.layerPoint.layer===layer.id?sel.layerPoint.i:null;const setPoint=(i:number|null)=>setLayerPoint(i===null||!layer?null:{layer:layer.id,i});
 const pen=sel.layerPen;
 useEffect(()=>{if(!pen)return;const k=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape'||e.key==='Enter'){setLayerPen(false);}};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[pen]);
 const target=isPath(layer)?layer:undefined;
 useEffect(()=>{if(pen||point===null||!target||target.locked)return;const k=(e:globalThis.KeyboardEvent)=>{if(e.key!=='Delete'&&e.key!=='Backspace')return;const el=e.target as HTMLElement|null;if(el&&(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)||el.isContentEditable))return;e.preventDefault();try{sess.dispatch(pathLayerEdit(sess.document!,target.id,{op:'remove',index:point}));setPoint(null);}catch{/* too few points */}};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);});
 if(!target&&!pen)return null;
 const locked=!!target?.locked;if(pen&&locked)return null;
 const w=Math.max(1,target?.source.width??comp.width),h=Math.max(1,target?.source.height??comp.height);
 const keys=target?.source.pathKeys,path:MaskPath|undefined=target?(keys?.length?lerpPath(keys,at):target.source.path as MaskPath):undefined;
 const scale=()=>{const c=gRef.current?.getScreenCTM();return c?1/Math.max(1e-6,Math.sqrt(Math.abs(c.a*c.d-c.b*c.c))):1;};
 const toLocal=(cx:number,cy:number):Vec2=>{const c=gRef.current!.getScreenCTM()!.inverse();const p=new DOMPoint(cx,cy).matrixTransform(c);return [p.x,p.y];};
 const edit=(o:PathLayerOp)=>pathLayerEdit(sess.document!,target!.id,o);
 const toComp=(cx:number,cy:number):Vec2=>{const c=gRef.current!.ownerSVGElement!.getScreenCTM()!.inverse();const p=new DOMPoint(cx,cy).matrixTransform(c);return [p.x,p.y];};
 const drag=(e:PointerEvent<SVGElement>,build:(dx:number,dy:number,p:Vec2)=>Edit,immediate:boolean,after?:()=>void,o:{comp?:boolean;click?:()=>void}={})=>{
  if(e.button!==0||locked)return;e.stopPropagation();const el=e.currentTarget;el.setPointerCapture(e.pointerId);
  const to=o.comp?toComp:toLocal,start=to(e.clientX,e.clientY);let moved=false;
  if(immediate){try{sess.previewEdits([build(0,0,start)]);moved=true;}catch{el.releasePointerCapture(e.pointerId);return;}}
  const mv=(ev:globalThis.PointerEvent)=>{const p=to(ev.clientX,ev.clientY);if(!immediate&&!moved&&Math.hypot(ev.clientX-e.clientX,ev.clientY-e.clientY)<3)return;
   try{sess.previewEdits([build(p[0]-start[0],p[1]-start[1],p)]);moved=true;}catch{/* out of range: keep last valid preview */}};
  const done=(commit:boolean)=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);if(moved&&commit){sess.commitPreview();after?.();}else{sess.cancelPreview();if(!moved&&commit)o.click?.();}};
  const up=()=>done(true);const esc=(ev:globalThis.KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();done(false);}};
  el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
 };
 const nudge=(apply:(dx:number,dy:number)=>void)=>(e:ReactKeyboardEvent<SVGElement>)=>{
  const dx=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0,dy=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0;if(!dx&&!dy)return;
  e.preventDefault();e.stopPropagation();const s=e.shiftKey?10:1;try{apply(dx*s,dy*s);}catch{/* stale */}
 };
 const k=scale(),r=5*k,locked2=locked||pen,common={fill:'var(--bg-elevated)',stroke:'var(--accent)',strokeWidth:2*k,tabIndex:locked2?-1:0,role:'slider' as const,className:`touch-none ${locked2?'cursor-default':'cursor-grab'}`};
 const outline=path?bezierPath({closed:path.closed,points:path.points.map(q=>({x:q.x*w,y:q.y*h,...(q.inX!==undefined?{inX:q.inX*w,inY:(q.inY??0)*h}:{}),...(q.outX!==undefined?{outX:q.outX*w,outY:(q.outY??0)*h}:{})}))},0,0):'';
 const matrix=target?worldMatrix(comp,target,at).join(' '):'1 0 0 1 0 0';
 const first=path&&!path.closed&&path.points.length>=3?path.points[0]:null;
 const penDown=(e:PointerEvent<SVGElement>)=>{
  const p0=toLocal(e.clientX,e.clientY);
  if(!target){const id=newId('layer');drag(e,(dx,dy)=>penNewLayerEdit(sess.document!,p0[0],p0[1],id,dx,dy),true,()=>sess.setView({selectedLayer:id}));return;}
  if(first&&Math.hypot(p0[0]-first.x*w,p0[1]-first.y*h)<=2*r){e.stopPropagation();try{sess.dispatch(edit({op:'close'}));setLayerPen(false);}catch{/* stale */}return;}
  drag(e,(dx,dy)=>pathLayerEdit(sess.document!,target.id,{op:'pen',x:p0[0]/w,y:p0[1]/h,outX:dx/w,outY:dy/h}),true,()=>setPoint(path?.points.length??0));
 };
 return <g ref={gRef} transform={`matrix(${matrix})`} data-testid="animation-pathlayer-overlay" role="group" aria-label={t('animation.pathLayer.overlay')}>
  {target&&<><path d={outline} fill="none" stroke="rgba(0,0,0,.55)" strokeWidth={4*k} strokeLinejoin="round" pointerEvents="none"/>
  <path d={outline} fill="none" stroke="var(--accent)" strokeWidth={2*k} strokeDasharray={`${6*k} ${4*k}`} strokeLinejoin="round" pointerEvents="none"/>
  {!pen&&!locked&&<path d={outline} fill="none" stroke="transparent" strokeWidth={12*k} pointerEvents="stroke" className="cursor-move" data-testid="animation-pathlayer-outline"
   onPointerDown={e=>{const p0=toLocal(e.clientX,e.clientY);drag(e,(dx,dy)=>pathLayerMoveEdit(sess.document!,target.id,dx,dy,at),false,undefined,{comp:true,click:()=>{const hit=nearest(path!,w,h,p0);if(hit)try{sess.dispatch(edit({op:'insert',index:hit.i,u:hit.u}));setPoint(hit.i+1);}catch{/* limit or stale */}}});}}/>}</>}
  {target&&path&&!pen&&point!==null&&path.points[point]&&(['in','out'] as const).map(wh=>{const q=path.points[point],hx=((wh==='in'?q.inX:q.outX)??0)*w,hy=((wh==='in'?q.inY:q.outY)??0)*h,cx=q.x*w+hx,cy=q.y*h+hy;
   return <g key={wh}><line x1={q.x*w} y1={q.y*h} x2={cx} y2={cy} stroke="var(--accent)" strokeWidth={k} pointerEvents="none"/>
    <circle cx={cx} cy={cy} r={r*0.8} {...common} aria-label={t(wh==='in'?'animation.masks.handleIn':'animation.masks.handleOut',{n:point+1})} data-testid={`animation-pathlayer-bez-${wh}`}
     onPointerDown={e=>drag(e,(_dx,_dy,p)=>pathLayerEdit(sess.document!,target.id,{op:'handle',index:point,which:wh,x:(p[0]-q.x*w)/w,y:(p[1]-q.y*h)/h,mirror:!e.altKey,t:keys?.length?at:undefined}),false)}
     onKeyDown={locked?undefined:nudge((dx,dy)=>sess.dispatch(edit({op:'handle',index:point,which:wh,x:(hx+dx)/w,y:(hy+dy)/h,mirror:true,t:keys?.length?at:undefined})))}/></g>;})}
  {target&&path&&path.points.map((q,i)=>
   <circle key={i} cx={q.x*w} cy={q.y*h} r={r} {...common} data-selected={point===i} aria-label={t('animation.masks.point',{n:i+1})} aria-valuetext={`${Math.round(q.x*w)}, ${Math.round(q.y*h)}`} data-testid="animation-pathlayer-point"
    onDoubleClick={pen||locked2?undefined:()=>{try{sess.dispatch(edit({op:'corner',index:i,smooth:q.outX===undefined&&q.inX===undefined}));}catch{/* stale */}}}
    onPointerDown={pen?undefined:e=>{if(e.altKey&&!locked){e.stopPropagation();try{sess.dispatch(edit({op:'remove',index:i}));setPoint(null);}catch{/* too few points */}return;}setPoint(i);drag(e,(_dx,_dy,p)=>pathLayerEdit(sess.document!,target.id,{op:'point',index:i,x:p[0]/w,y:p[1]/h,t:keys?.length?at:undefined}),false);}}
    onKeyDown={locked2?undefined:nudge((dx,dy)=>sess.dispatch(edit({op:'point',index:i,x:q.x+dx/w,y:q.y+dy/h,t:keys?.length?at:undefined})))}/>)}
  {pen&&<rect x={-comp.width} y={-comp.height} width={3*comp.width} height={3*comp.height} fill="transparent" className="cursor-crosshair touch-none" data-testid="animation-layerpen-surface" onPointerDown={penDown}/>}
 </g>;
}
