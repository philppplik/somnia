import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
/** Cut the selected layers' in and out points to the work area. Own file so the big command array keeps cheap type inference. */
export const MAX_TRIM_LAYERS=50;
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const layerTrimSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.trimToWorkArea',title:'Trim the selected layers to the work area',category:'Edit',level:'ui',keywords:['animation','layer','trim','cut','work area','in','out','range','crop'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_TRIM_LAYERS}},additionalProperties:false},
 // The Rig menu passes its own ticked layers, so this must not depend on the timeline selection.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p?:{layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const ls=(p?.layers??layerSetIds(s.getState().view.selectedLayer)).slice(0,MAX_TRIM_LAYERS).map(id=>findLayer(c,id)).filter(l=>!!l);
  if(!ls.length)return expected('Select a layer first.');
  const wi=Math.max(0,c.workArea.in),wo=Math.min(c.duration,c.workArea.out);
  let skipped=0;const edits:Edit[]=[];
  for(const l of ls){
   if(l!.locked||l!.kind==='audio'){skipped++;continue;}
   const inT=Math.max(l!.inT,wi),outT=Math.min(l!.outT,wo);
   if(outT<=inT){skipped++;continue;}
   if(inT!==l!.inT||outT!==l!.outT)edits.push({type:'layer.timing',layer:l!.id,inT,outT});
  }
  if(!edits.length)return expected(skipped?'No selected layer can be trimmed (locked, audio or outside the work area).':'The layers already fit the work area.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {trimmed:edits.length,skipped};
 }) as (p?:unknown)=>unknown}];
