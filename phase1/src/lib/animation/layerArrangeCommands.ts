import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer} from './model';
import {EditError} from './edit';
import {layerSetIds} from './layerSet';
import {MAX_DUPLICATE_LAYERS} from './layerDuplicate';
import {ARRANGE_MODES,arrangePlan,type ArrangeMode} from './layerArrange';
/** Stacking order of the selected layers: front, back, one step up or down, reverse. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const layerArrangeSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.arrange',title:'Arrange the stacking order of the selected layers',category:'Edit',level:'ui',keywords:['animation','layer','order','stack','front','back','raise','lower','reverse','z-order'],
 params:{type:'object',properties:{mode:{type:'string',enum:[...ARRANGE_MODES]},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_DUPLICATE_LAYERS}},required:['mode'],additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document,c=d?findComp(d):undefined;return !!c&&layerSetIds(s.getState().view.selectedLayer).some(id=>!!findLayer(c,id));},
 run:((p:{mode:ArrangeMode;layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!ARRANGE_MODES.includes(p?.mode))return expected('Unknown arrange mode.');
  const ids=(p.layers??layerSetIds(s.getState().view.selectedLayer)).filter(id=>!!findLayer(c,id));
  if(!ids.length)return expected('Select a layer first.');
  const r=arrangePlan(c,ids,p.mode);
  if(!r.edits.length)return expected(p.mode==='reverse'&&ids.length<2?'Select at least two layers to reverse.':'The layers are already there.');
  try{s.dispatch(r.edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {moved:r.moved};
 }) as (p:unknown)=>unknown}];
