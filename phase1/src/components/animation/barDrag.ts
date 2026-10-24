import type {PointerEvent,KeyboardEvent as ReactKeyboardEvent} from 'react';
import type {Layer} from '../../lib/animation/model';
import {barDragEdits,type BarDrag} from '../../lib/animation/barDrag';
import {findComp} from '../../lib/animation/model';
import {layerSetIds} from '../../lib/animation/layerSet';
import {snapToFrame,frameToTick} from '../../lib/animation/time';
import {animationSession} from '../../lib/animation/session';
/**
 * Starts a drag on a timeline layer bar. `tickAt` turns a pointer x into a frame-snapped tick. The preview follows the pointer and keeps the last valid
 * state when a position is refused; one undo step on release, Escape cancels.
 */
export function startBarDrag(e:PointerEvent<HTMLElement>,l:Layer,edge:'body'|'in'|'out',tickAt:(x:number)=>number){
 if(e.button!==0||l.locked||l.kind==='audio')return;
 e.stopPropagation();e.preventDefault();
 const mode:BarDrag=edge==='in'?'trimIn':edge==='out'?'trimOut':e.shiftKey?'slip':'move';
 const el=e.currentTarget,s=animationSession(),t0=tickAt(e.clientX),ripple=e.altKey&&edge==='out';let last=0;
 const edits_=(d:number)=>{const doc=s.document,c=doc?findComp(doc):undefined;return c?barDragEdits(c,l.id,layerSetIds(s.getState().view.selectedLayer),mode,d,ripple):[];};
 el.setPointerCapture(e.pointerId);if(!layerSetIds(s.getState().view.selectedLayer).includes(l.id))s.setView({selectedLayer:l.id});
 const mv=(ev:globalThis.PointerEvent)=>{
  const d=tickAt(ev.clientX)-t0;if(d===last)return;
  const edits=edits_(d);
  if(!edits.length){s.cancelPreview();last=d;return;}
  try{s.previewEdits(edits);last=d;}catch{/* refused position: keep the last valid preview */}
 };
 const done=(commit:boolean)=>{
  el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);
  if(commit&&last!==0)s.commitPreview();else s.cancelPreview();
 };
 const up=()=>done(true);
 const esc=(ev:globalThis.KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();done(false);}};
 el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
}

/** Arrow keys on a focused bar: Left or Right moves the layer (or the whole layer set) by a frame, Shift by ten, Alt slips the keys. One undo step. */
export function nudgeBar(e:ReactKeyboardEvent<HTMLElement>,l:Layer){
 if((e.key!=='ArrowLeft'&&e.key!=='ArrowRight')||l.locked||l.kind==='audio')return;
 e.preventDefault();e.stopPropagation();
 const s=animationSession(),doc=s.document,c=doc?findComp(doc):undefined;if(!c)return;
 const frames=(e.shiftKey?10:1)*(e.key==='ArrowLeft'?-1:1),delta=frameToTick(frames,c.fps);
 const edits=barDragEdits(c,l.id,layerSetIds(s.getState().view.selectedLayer),e.altKey?'slip':'move',snapToFrame(delta,c.fps));
 if(!edits.length)return;
 try{s.dispatch(edits);}catch{/* refused: nothing changes */}
}
