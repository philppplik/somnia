import type {Edit} from './edit';
import type {Composition,KeyRef} from './model';
import {snapToFrame} from './time';
export const MAX_KEY_ALL=400;
/** key.add edits for each animated transform property (at least one key) of the layers that has no key at the playhead yet. Locked layers are skipped. */
export function keyAllEdits(c:Composition,layers:readonly string[],playhead:number):{edits:Edit[];refs:KeyRef[]}{
 const t=snapToFrame(playhead,c.fps),edits:Edit[]=[],refs:KeyRef[]=[];
 if(t<c.start||t>c.start+c.duration)return {edits,refs};
 for(const l of c.layers){
  if(!layers.includes(l.id)||l.locked)continue;
  for(const prop of Object.keys(l.transform) as KeyRef['prop'][]){
   const ks=l.transform[prop].keys;
   if(!ks.length||ks.some(k=>k.t===t))continue;
   edits.push({type:'key.add',layer:l.id,prop,t});refs.push({layer:l.id,prop,t});
  }
 }
 if(edits.length>MAX_KEY_ALL)throw Object.assign(new Error('Too many properties.'),{expected:true});
 return {edits,refs};
}
