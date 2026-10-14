import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer} from './model';
import {EditError} from './edit';
import {layerSetIds} from './layerSet';
import {ALIGN_MODES,MAX_ALIGN_LAYERS,alignPlan,type AlignMode} from './layerAlign';
/** Align or distribute the anchor points of the selected layers at the playhead. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const layerAlignSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.align',title:'Align or distribute the selected layers',category:'Edit',level:'ui',keywords:['animation','layer','align','distribute','left','right','top','bottom','center','middle','spacing','position'],
 params:{type:'object',properties:{mode:{type:'string',enum:[...ALIGN_MODES]},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_ALIGN_LAYERS}},required:['mode'],additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>1;},
 run:((p:{mode:AlignMode;layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!ALIGN_MODES.includes(p?.mode))return expected('Unknown align mode.');
  const ids=(p.layers??layerSetIds(s.getState().view.selectedLayer)).filter(id=>!!findLayer(c,id));
  if(ids.length<2)return expected('Select at least two layers.');
  if(p.mode.startsWith('distribute')&&ids.length<3)return expected('Distribute needs at least three layers.');
  const r=alignPlan(c,ids,p.mode,s.getState().view.playhead);
  if(!r.edits.length)return expected(r.skipped&&r.skipped>=ids.length-1?'The other layers are locked or cannot move.':'The layers are already aligned.');
  try{s.dispatch(r.edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {moved:r.moved,skippedLocked:r.skipped};
 }) as (p:unknown)=>unknown}];
