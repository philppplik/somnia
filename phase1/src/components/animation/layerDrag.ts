import type {PointerEvent} from 'react';
import {evaluate} from '../../lib/animation/interpolate';
import {animationSession} from '../../lib/animation/session';
import {normalizeOverlays} from '../../lib/animation/guides';
import {layerSnapPoints,snapMove,guideTargets,toParentDelta} from '../../lib/animation/snap';
import type {Composition,Layer} from '../../lib/animation/model';
import type {Line} from '../../lib/animation/guides';
const r2=(n:number)=>Math.round(n*100)/100;
/** Drag a layer in the viewer: one preview per move, one undo step on release, Escape cancels. Snaps to guides, centre, thirds, safe frames and the comp edges (hold Alt to turn snapping off). */
export function startLayerDrag(e:PointerEvent<SVGElement>,comp:Composition,l:Layer,at:number,onSnap:(lines:Line[])=>void){
 if(e.button!==0||l.locked)return;const svg=e.currentTarget.ownerSVGElement;const ctm=svg?.getScreenCTM();if(!svg||!ctm)return;
 const inv=ctm.inverse(),sess=animationSession(),el=e.currentTarget;
 const pt=(x:number,y:number)=>{const p=new DOMPoint(x,y).matrixTransform(inv);return [p.x,p.y] as const;};
 const p0=pt(e.clientX,e.clientY),start=evaluate(l.transform.position,at) as readonly number[];
 const pts=layerSnapPoints(comp,l,at),targets=guideTargets(comp,normalizeOverlays(sess.getState().view.overlays));
 const thr=8/Math.max(1e-6,Math.sqrt(Math.abs(ctm.a*ctm.d-ctm.b*ctm.c)));
 let moved=false;el.setPointerCapture(e.pointerId);const x0=e.clientX,y0=e.clientY;
 const mv=(ev:globalThis.PointerEvent)=>{
  if(!moved&&Math.hypot(ev.clientX-x0,ev.clientY-y0)<3)return;moved=true;
  const p=pt(ev.clientX,ev.clientY);const raw:[number,number]=[p[0]-p0[0],p[1]-p0[1]];
  const s=ev.altKey?{delta:raw,lines:[] as Line[]}:snapMove(pts,raw,targets,comp.width,comp.height,thr);
  const d=toParentDelta(comp,l,at,s.delta);onSnap(s.lines);
  try{sess.previewEdits([{type:'prop.set',layer:l.id,prop:'position',t:at,value:[r2(start[0]+d[0]),r2(start[1]+d[1])]}]);}catch{/* out of range: keep the last frame */}
 };
 const done=(commit:boolean)=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);onSnap([]);
  if(moved&&commit)sess.commitPreview();else sess.cancelPreview();};
 const up=()=>done(true);const esc=(ev:KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();done(false);}};
 el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
}
