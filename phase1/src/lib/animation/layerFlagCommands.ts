import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {MAX_DUPLICATE_LAYERS} from './layerDuplicate';
/** Switch visible, solo, locked or shy for the selected layers at once. Own file so the big command array keeps cheap type inference. */
export const LAYER_FLAGS=['visible','solo','locked','shy'] as const;
export type LayerFlag=typeof LAYER_FLAGS[number];
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const layerFlagSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.flag',title:'Switch a layer flag for the selected layers',category:'Edit',level:'ui',keywords:['animation','layer','visible','hide','show','solo','lock','unlock','shy','toggle','eye'],
 params:{type:'object',properties:{flag:{type:'string',enum:[...LAYER_FLAGS]},value:{type:'boolean'},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_DUPLICATE_LAYERS}},required:['flag'],additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document,c=d?findComp(d):undefined;return !!c&&layerSetIds(s.getState().view.selectedLayer).some(id=>!!findLayer(c,id));},
 run:((p:{flag:LayerFlag;value?:boolean;layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!LAYER_FLAGS.includes(p?.flag))return expected('Unknown layer flag.');
  const ls=(p.layers??layerSetIds(s.getState().view.selectedLayer)).map(id=>findLayer(c,id)).filter(l=>!!l);
  if(!ls.length)return expected('Select a layer first.');
  // Locked layers refuse every change except unlocking.
  const open=p.flag==='locked'?ls:ls.filter(l=>!l!.locked),skippedLocked=ls.length-open.length;
  if(!open.length)return expected('The selected layers are locked.');
  // Toggle: when any layer is off, switch all on; otherwise all off.
  const value=p.value??!open.every(l=>!!l![p.flag]);
  const edits:Edit[]=open.filter(l=>!!l![p.flag]!==value).map(l=>({type:'layer.update',layer:l!.id,[p.flag]:value}) as Edit);
  if(!edits.length)return expected('The layers already have that setting.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {changed:edits.length,value,skippedLocked};
 }) as (p:unknown)=>unknown}];
