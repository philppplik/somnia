import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,newId,type Composition} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
/** Repeat an audio clip back to back until the composition ends. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_LOOP_COPIES=20;
/** Edits that add the repeats of one clip (placement and length per copy), or null when the clip already reaches the end. The last copy is cut at the composition end. */
export function loopPlan(c:Composition,layerId:string,ids:readonly string[]):{edits:Edit[];copies:number;capped:boolean}|null{
 const l=c.layers.find(x=>x.id===layerId);if(!l||l.kind!=='audio'||!l.audio||l.outT<1)return null;
 const len=l.outT;let at=l.offset+len;
 // Repeats made earlier (same file part, placed back to back) count, so running the command twice adds nothing.
 for(;;){const hit=c.layers.find(x=>x.id!==l.id&&x.kind==='audio'&&x.audio&&x.audio.assetId===l.audio.assetId&&x.audio.trimIn===l.audio.trimIn&&x.offset===at&&x.outT<=len);if(!hit)break;at+=len;}const edits:Edit[]=[],made:{id:string;at:number;len:number}[]=[];
 while(at<c.duration&&made.length<Math.min(MAX_LOOP_COPIES,ids.length)){const n=Math.min(len,c.duration-at);if(n<1)break;made.push({id:ids[made.length],at,len:n});at+=len;}
 if(!made.length)return null;
 for(const m of made)edits.push({type:'layers.duplicate',layers:[layerId],ids:[m.id]});
 for(const m of made)edits.push({type:'audio.update',layer:m.id,offset:m.at,length:m.len});
 return {edits,copies:made.length,capped:at<c.duration};
}
export const audioLoopSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.audio.loopToEnd',title:'Repeat the audio clip until the composition ends',category:'Edit',level:'ui',keywords:['animation','audio','loop','repeat','fill','music','background','duplicate','end'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:10}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.some(l=>l.kind==='audio');},
 run:((p:{layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,10).map(id=>findLayer(c,id)).filter(l=>!!l&&l.kind==='audio'&&!!l.audio);
  if(!ls.length)return expected('Select an audio layer.');
  const edits:Edit[]=[];let copies=0,capped=false,keyed=0;
  for(const l of ls){
   if(l!.audio!.volume.keys.length){keyed++;continue;}
   const r=loopPlan(c,l!.id,Array.from({length:MAX_LOOP_COPIES},()=>newId('layer')));if(!r)continue;
   edits.push(...r.edits);copies+=r.copies;capped=capped||r.capped;
  }
  if(!edits.length)return expected(keyed?'Clips with a volume curve are not repeated; remove the volume keys first.':'The clip already runs to the end of the composition.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {copies,capped,skippedKeyed:keyed};
 }) as (p:unknown)=>unknown}];
