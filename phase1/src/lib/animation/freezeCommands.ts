import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,TRANSFORM_KEYS,type Layer,type PropValue} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {evaluate} from './interpolate';
/** Freeze frame: from the playhead on, the ticked layers keep the pose they have there. Every animated transform property gets a held key at the playhead and loses its later keys. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_FREEZE_LAYERS=30;
export const freezeSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.freeze',title:'Freeze the ticked layers at the playhead',category:'Edit',level:'ui',keywords:['animation','freeze','hold','still','pause','stop','frame','playhead','stay'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_FREEZE_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const t=s.getState().view.playhead;
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_FREEZE_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.kind!=='audio');
  if(!ls.length)return expected('Tick at least one unlocked layer.');
  const edits:Edit[]=[];let props=0,skipped=0;
  for(const l of ls)for(const prop of TRANSFORM_KEYS){
   const pr=l.transform[prop];if(pr.keys.length<1||!pr.keys.some(k=>k.t>t))continue;
   if(pr.modifiers?.length){skipped++;continue;}
   const v=evaluate(pr,t) as PropValue,has=pr.keys.some(k=>k.t===t);
   for(const k of pr.keys)if(k.t>t)edits.push({type:'key.remove',layer:l.id,prop,t:k.t});
   if(!has)edits.push({type:'key.add',layer:l.id,prop,t},{type:'prop.set',layer:l.id,prop,t,value:v as never});
   edits.push({type:'key.interp',layer:l.id,prop,t,interp:'hold'});props++;}
  if(!props)return expected(skipped?'The animated properties have modifiers, which cannot be frozen here.':'Nothing to freeze: the ticked layers have no keys after the playhead.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {properties:props,skipped};
 }) as (p:unknown)=>unknown}];
