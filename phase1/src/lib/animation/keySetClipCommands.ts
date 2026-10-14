import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {getSetClip,pasteSetEdits,pastedSetRefs,setKeyRefs,MAX_SET_CLIP_LAYERS} from './keySetClip';
/** Paste keys onto a set of layers, paste in place, and select the keys of a layer set. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
const comp=()=>{const d=animationSession().document,c=d?findComp(d):undefined;return c??expected('No composition is open.');};
const layers={type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:MAX_SET_CLIP_LAYERS};
const ready=()=>!!animationSession().document;
export const keySetClipSpecs=():CommandSpec<unknown,unknown>[]=>[
 {id:'animation.keys.pasteToSet',title:'Paste copied keys onto several layers',category:'Edit',level:'ui',keywords:['animation','keys','paste','layers','set','in place'],
  params:{type:'object',properties:{layers,inPlace:{type:'boolean'}},required:['layers'],additionalProperties:false},
  enabled:()=>ready()&&!!getSetClip(),
  run:((p:{layers:string[];inPlace?:boolean})=>{
   const s=animationSession(),c=comp(),k=getSetClip()??expected('No copied keys. Copy keys first.');
   try{const at=s.getState().view.playhead;s.dispatch(pasteSetEdits(c,k,at,p.layers,!!p.inPlace));s.selectKeys(pastedSetRefs(c,k,at,p.layers,!!p.inPlace));}
   catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
   return {layers:p.layers.length};
  }) as (p:unknown)=>unknown},
 {id:'animation.keys.pasteInPlace',title:'Paste copied keys at their original times',category:'Edit',level:'ui',keywords:['animation','keys','paste','in place','original'],
  params:{type:'object',properties:{},additionalProperties:false},
  enabled:()=>ready()&&!!getSetClip(),
  run:((_p:unknown)=>{
   const s=animationSession(),c=comp(),k=getSetClip()??expected('No copied keys. Copy keys first.');
   const sel=s.getState().view.selectedLayer;const to=k.groups.length===1&&sel?[sel]:null;
   try{s.dispatch(pasteSetEdits(c,k,0,to,true));s.selectKeys(pastedSetRefs(c,k,0,to,true));}
   catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
   return {};
  }) as (p:unknown)=>unknown},
 {id:'animation.keys.selectSet',title:'Select all keys of several layers',category:'View',level:'ui',keywords:['animation','keys','select','layers','set'],
  params:{type:'object',properties:{layers},required:['layers'],additionalProperties:false},
  enabled:ready,
  run:((p:{layers:string[]})=>{const refs=setKeyRefs(comp(),p.layers);if(!refs.length)return expected('Those layers have no keys.');animationSession().selectKeys(refs);return {keys:refs.length};}) as (p:unknown)=>unknown}];
