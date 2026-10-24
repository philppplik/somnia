import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,newId} from './model';
import {EditError} from './edit';
import {clearLayerSet,layerSetIds,toggleLayerInSet} from './layerSet';
import {splitPlan} from './layerSplit';
import {MAX_DUPLICATE_LAYERS} from './layerDuplicate';
/** Split the selected layers at the playhead. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const layerSplitSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.split',title:'Split the selected layers at the playhead',category:'Edit',level:'ui',keywords:['animation','layer','split','cut','razor','playhead'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_DUPLICATE_LAYERS}},additionalProperties:false},
 // The Rig menu passes its own ticked layers, so this must not depend on the timeline selection; run() reports an empty set.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const ids=(p.layers??layerSetIds(s.getState().view.selectedLayer)).filter(id=>!!findLayer(c,id));
  if(!ids.length)return expected('Select a layer first.');
  if(ids.length>MAX_DUPLICATE_LAYERS)return expected(`Pick at most ${MAX_DUPLICATE_LAYERS} layers.`);
  const r=splitPlan(c,ids,s.getState().view.playhead,n=>Array.from({length:n},()=>newId('layer')));
  if(!r.edits.length)return expected('The playhead must be inside a layer.');
  try{s.dispatch(r.edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  const later=Object.values(r.made),primary=s.getState().view.selectedLayer;
  clearLayerSet();later.slice(1).forEach(id=>toggleLayerInSet(id));
  s.setView({selectedLayer:(primary&&r.made[primary])||later[0],selectedKey:null});return {split:later.length,skipped:r.skipped};
 }) as (p:unknown)=>unknown}];
