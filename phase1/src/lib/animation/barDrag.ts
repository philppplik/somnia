import type {Layer} from './model';
import type {Edit} from './edit';
/** Timeline bar drags: the body slides the layer with its keys (shift slips the keys under the same in/out), the edges trim in or out. Pure. */
export type BarDrag='move'|'slip'|'trimIn'|'trimOut';
/** The single edit for a drag by `delta` ticks, or null for no change or a layer that cannot be dragged (audio, locked). */
export function barDragEdit(l:Layer,mode:BarDrag,delta:number):Edit|null{
 if(!Number.isInteger(delta)||delta===0||l.locked||l.kind==='audio')return null;
 if(mode==='trimIn')return {type:'layer.timing',layer:l.id,inT:l.inT+delta,outT:l.outT};
 if(mode==='trimOut')return {type:'layer.timing',layer:l.id,inT:l.inT,outT:l.outT+delta};
 const how:'slide'|'slip'=mode==='slip'?'slip':'slide',e:Edit={type:'layer.shift',layer:l.id,delta,mode:how};
 return e;
}
import type {Composition} from './model';
/**
 * Edits for a bar drag that may involve several layers. `picked` is the layer set (used when it contains the dragged layer, otherwise only the
 * dragged layer moves). `ripple` applies to trimOut only: every other unlocked, non-audio layer that starts at or after the old end slides by the same delta.
 */
export function barDragEdits(c:Composition,dragged:string,picked:readonly string[],mode:BarDrag,delta:number,ripple=false):Edit[]{
 const lead=c.layers.find(l=>l.id===dragged);if(!lead)return [];
 const ids=picked.includes(dragged)?[...new Set(picked)]:[dragged];
 const targets=ids.map(id=>c.layers.find(l=>l.id===id)).filter((l):l is Layer=>!!l);
 const edits:Edit[]=[];
 for(const l of targets){const e=barDragEdit(l,mode,delta);if(e)edits.push(e);}
 if(ripple&&mode==='trimOut'&&delta!==0){
  const skip=new Set(targets.map(l=>l.id));
  for(const l of c.layers){if(skip.has(l.id)||l.inT<lead.outT)continue;const e=barDragEdit(l,'move',delta);if(e)edits.push(e);}
 }
 return edits;
}
