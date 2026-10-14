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
