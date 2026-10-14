import type {PointerEvent} from 'react';
import {evaluate} from '../../lib/animation/interpolate';
import {animationSession} from '../../lib/animation/session';
import {worldMatrix} from '../../lib/animation/scene';
import {angleDelta,angleOf,rotateTo,scaleDrag,handleSet} from '../../lib/animation/handles';
import type {Composition,Layer} from '../../lib/animation/model';
/** Drag a scale or rotate handle: one preview per move, one undo step on release, Escape cancels. Shift = free scale / 15 degree steps. */
export function startHandleDrag(e:PointerEvent<SVGElement>,kind:'scale'|'rotate',comp:Composition,l:Layer,at:number){
 if(e.button!==0||l.locked)return;e.stopPropagation();e.preventDefault();
 const svg=e.currentTarget.ownerSVGElement,ctm=svg?.getScreenCTM(),hs=handleSet(comp,l,at);if(!svg||!ctm||!hs)return;
 const inv=ctm.inverse(),sess=animationSession(),el=e.currentTarget;
 const pt=(x:number,y:number):readonly [number,number]=>{const p=new DOMPoint(x,y).matrixTransform(inv);return [p.x,p.y];};
 const p0=pt(e.clientX,e.clientY),m0=worldMatrix(comp,l,at),anchor=l.transform.anchor.value as readonly number[];
 const s0=evaluate(l.transform.scale,at) as readonly number[],r0=evaluate(l.transform.rotation,at) as number;
 let prev=angleOf(hs.anchor,p0),total=0,moved=false;el.setPointerCapture(e.pointerId);const x0=e.clientX,y0=e.clientY;
 const mv=(ev:globalThis.PointerEvent)=>{
  if(!moved&&Math.hypot(ev.clientX-x0,ev.clientY-y0)<3)return;moved=true;const p=pt(ev.clientX,ev.clientY);
  try{
   if(kind==='scale'){const v=scaleDrag(m0,anchor,s0,p0,p,!ev.shiftKey);if(v)sess.previewEdits([{type:'prop.set',layer:l.id,prop:'scale',t:at,value:v}]);}
   else{const a=angleOf(hs.anchor,p);total+=angleDelta(prev,a);prev=a;sess.previewEdits([{type:'prop.set',layer:l.id,prop:'rotation',t:at,value:rotateTo(r0,total,ev.shiftKey?15:undefined)}]);}
  }catch{/* out of range: keep the last frame */}
 };
 const done=(commit:boolean)=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);if(moved&&commit)sess.commitPreview();else sess.cancelPreview();};
 const up=()=>done(true);const esc=(ev:KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();done(false);}};
 el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
}
