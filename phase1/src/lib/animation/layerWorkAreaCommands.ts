import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer} from './model';
import {EditError} from './edit';
import {layerSetIds} from './layerSet';
import {MAX_DUPLICATE_LAYERS} from './layerDuplicate';
/** Set the work area to the in/out span of the selected layers. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const layerWorkAreaSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.workarea.toLayers',title:'Set the work area to the selected layers',category:'Edit',level:'ui',keywords:['animation','work area','layers','range','span','in','out','bounds','export'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_DUPLICATE_LAYERS}},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document,c=d?findComp(d):undefined;return !!c&&layerSetIds(s.getState().view.selectedLayer).some(id=>!!findLayer(c,id));},
 run:((p:{layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const ls=(p.layers??layerSetIds(s.getState().view.selectedLayer)).map(id=>findLayer(c,id)).filter(l=>!!l);
  if(!ls.length)return expected('Select a layer first.');
  const a=Math.max(0,Math.min(...ls.map(l=>l!.inT))),b=Math.min(c.duration,Math.max(...ls.map(l=>l!.outT)));
  if(a===c.workArea.in&&b===c.workArea.out)return expected('The work area already spans the selected layers.');
  try{s.dispatch({type:'workarea.set',in:a,out:b});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {in:a,out:b};
 }) as (p:unknown)=>unknown}];
