import type {PointerEvent} from 'react';
import type {Layer} from '../../lib/animation/model';
import {barDragEdit,type BarDrag} from '../../lib/animation/barDrag';
import {animationSession} from '../../lib/animation/session';
/**
 * Starts a drag on a timeline layer bar. `tickAt` turns a pointer x into a frame-snapped tick. The preview follows the pointer and keeps the last valid
 * state when a position is refused; one undo step on release, Escape cancels.
 */
export function startBarDrag(e:PointerEvent<HTMLElement>,l:Layer,edge:'body'|'in'|'out',tickAt:(x:number)=>number){
 if(e.button!==0||l.locked||l.kind==='audio')return;
 e.stopPropagation();e.preventDefault();
 const mode:BarDrag=edge==='in'?'trimIn':edge==='out'?'trimOut':e.shiftKey?'slip':'move';
 const el=e.currentTarget,s=animationSession(),t0=tickAt(e.clientX);let last=0;
 el.setPointerCapture(e.pointerId);s.setView({selectedLayer:l.id});
 const mv=(ev:globalThis.PointerEvent)=>{
  const d=tickAt(ev.clientX)-t0;if(d===last)return;
  const edit=barDragEdit(l,mode,d);
  if(!edit){s.cancelPreview();last=d;return;}
  try{s.previewEdits([edit]);last=d;}catch{/* refused position: keep the last valid preview */}
 };
 const done=(commit:boolean)=>{
  el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);
  if(commit&&last!==0)s.commitPreview();else s.cancelPreview();
 };
 const up=()=>done(true);
 const esc=(ev:globalThis.KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();done(false);}};
 el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
}
