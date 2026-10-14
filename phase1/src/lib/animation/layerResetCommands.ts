import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type PropValue} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {evaluate} from './interpolate';
/** Reset rotation, scale or opacity of the selected layers to neutral at the playhead. Own file so the big command array keeps cheap type inference. */
export const RESET_MODES=['rotation','scale','opacity','all'] as const;
export type ResetMode=typeof RESET_MODES[number];
export const MAX_RESET_LAYERS=50;
const NEUTRAL={rotation:0,scale:[100,100],opacity:100} as const;
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
const same=(a:PropValue,b:PropValue)=>typeof a==='number'||typeof b==='number'?a===b:a[0]===b[0]&&a[1]===b[1];
export const layerResetSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.reset',title:'Reset rotation, scale or opacity of the selected layers',category:'Edit',level:'ui',keywords:['animation','layer','reset','neutral','rotation','scale','opacity','transform','default'],
 params:{type:'object',properties:{mode:{type:'string',enum:[...RESET_MODES]},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_RESET_LAYERS}},required:['mode'],additionalProperties:false},
 // The Rig menu passes its own ticked layers, so this must not depend on the timeline selection.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{mode:ResetMode;layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!RESET_MODES.includes(p?.mode))return expected('Unknown reset mode.');
  const ls=(p.layers??layerSetIds(s.getState().view.selectedLayer)).slice(0,MAX_RESET_LAYERS).map(id=>findLayer(c,id)).filter(l=>!!l);
  if(!ls.length)return expected('Select a layer first.');
  const t=s.getState().view.playhead,props=p.mode==='all'?(['rotation','scale','opacity'] as const):[p.mode] as const;
  const open=ls.filter(l=>!l!.locked&&l!.kind!=='audio'),skippedLocked=ls.length-open.length;
  if(!open.length)return expected('The selected layers are locked.');
  const edits:Edit[]=[];
  for(const l of open)for(const k of props){const v=NEUTRAL[k] as PropValue;if(!same(evaluate(l!.transform[k],t),v))edits.push({type:'prop.set',layer:l!.id,prop:k,value:v,t});}
  if(!edits.length)return expected('The layers are already neutral.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {changed:edits.length,skippedLocked};
 }) as (p:unknown)=>unknown}];
