import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError,styleKeyDeleteEdits,styleLaneKeys} from './edit';
import {pruneSelection} from './selection';
import {pruneStyleKeys,styleKeyLanes} from './keyLanes';
import {copyKeys,getKeyClip,setKeyClip,pastedRefs} from './keyclip';
import type {Edit} from './edit';
import {getSetClip,setSetClip,copySetKeys,pasteSetEdits,pastedSetRefs,pastedStyleRefs,setKeyRefs,MAX_SET_CLIP_LAYERS} from './keySetClip';
/** Paste keys onto a set of layers, paste in place, and select the keys of a layer set. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
const comp=()=>{const d=animationSession().document,c=d?findComp(d):undefined;return c??expected('No composition is open.');};
const picks=()=>{const s=animationSession(),d=s.document,c=d?findComp(d):undefined,v=s.getState().view;
 return {c,d,keys:pruneSelection(d,v.selectedKeys),style:c?pruneStyleKeys(c.layers,v.styleKeys??[]):[]};};
/** True when transform or style keys are selected. */
export const hasKeySelection=()=>{const p=picks();return p.keys.length>0||p.style.length>0;};
/** Copies the selected transform and style keys, from any number of layers. */
export function copySelection():void{
 const p=picks();if(!p.c||!p.d)return expected('No composition is open.');const d=p.d;
 try{
  setSetClip(copySetKeys(p.c,p.keys,p.style,(layer,lane)=>styleLaneKeys(d,layer,lane)));
  const one=new Set(p.keys.map(k=>k.layer)).size===1&&!p.style.length;setKeyClip(one?copyKeys(d,p.keys):null);
 }catch(e){if(e instanceof Error&&(e as {expected?:boolean}).expected)throw e;if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
}
/** Copy, then remove the copied keys in one undo step. */
export function cutSelection():void{
 copySelection();const p=picks();const edits:Edit[]=[];
 if(p.keys.length)edits.push({type:'keys.remove',keys:p.keys});
 for(const layer of new Set(p.style.map(x=>x.layer)))edits.push(...styleKeyDeleteEdits(layer,p.style.filter(x=>x.layer===layer)));
 const s=animationSession();try{if(edits.length)s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
 s.selectKeys([]);s.setView({styleKeys:[]});
}
/** Pastes the set clipboard at the playhead: back onto the copied layers, or onto `layer` (default the selected layer) for a one-layer copy. */
export function pasteSelection(layer?:string):void{
 const s=animationSession(),c=comp(),k=getSetClip()??expected('No copied keys. Copy keys first.');
 const sel=layer??s.getState().view.selectedLayer;const to=k.groups.length===1?[sel&&c.layers.some(l=>l.id===sel)?sel:expected('Select a layer first.')]:null;
 const at=s.getState().view.playhead;
 try{s.dispatch(pasteSetEdits(c,k,at,to));s.selectKeys(pastedSetRefs(c,k,at,to));s.setView({styleKeys:pastedStyleRefs(c,k,at,to)});}
 catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
}
/** True when pasting needs the set path (several layers or style keys); plain one-layer transform copies keep the older single paste. */
export const needsSetPaste=()=>{const k=getSetClip();return !!k&&(k.groups.length>1||k.groups.some(g=>g.style.length>0));};
const layers={type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:MAX_SET_CLIP_LAYERS};
const ready=()=>!!animationSession().document;
export const keySetClipSpecs=():CommandSpec<unknown,unknown>[]=>[
 {id:'animation.keys.pasteToSet',title:'Paste copied keys onto several layers',category:'Edit',level:'ui',keywords:['animation','keys','paste','layers','set','in place'],
  params:{type:'object',properties:{layers,inPlace:{type:'boolean'}},required:['layers'],additionalProperties:false},
  enabled:()=>ready()&&!!getSetClip(),
  run:((p:{layers:string[];inPlace?:boolean})=>{
   const s=animationSession(),c=comp(),k=getSetClip()??expected('No copied keys. Copy keys first.');
   try{const at=s.getState().view.playhead;s.dispatch(pasteSetEdits(c,k,at,p.layers,!!p.inPlace));s.selectKeys(pastedSetRefs(c,k,at,p.layers,!!p.inPlace));s.setView({styleKeys:pastedStyleRefs(c,k,at,p.layers,!!p.inPlace)});}
   catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
   return {layers:p.layers.length};
  }) as (p:unknown)=>unknown},
 {id:'animation.keys.pasteInPlace',title:'Paste copied keys at their original times',category:'Edit',level:'ui',keywords:['animation','keys','paste','in place','original'],
  params:{type:'object',properties:{},additionalProperties:false},
  enabled:()=>ready()&&!!getSetClip(),
  run:((_p:unknown)=>{
   const s=animationSession(),c=comp(),k=getSetClip()??expected('No copied keys. Copy keys first.');
   const sel=s.getState().view.selectedLayer;const to=k.groups.length===1&&sel?[sel]:null;
   try{s.dispatch(pasteSetEdits(c,k,0,to,true));s.selectKeys(pastedSetRefs(c,k,0,to,true));s.setView({styleKeys:pastedStyleRefs(c,k,0,to,true)});}
   catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
   return {};
  }) as (p:unknown)=>unknown},
 {id:'animation.keys.selectSet',title:'Select all keys of several layers',category:'View',level:'ui',keywords:['animation','keys','select','layers','set'],
  params:{type:'object',properties:{layers},required:['layers'],additionalProperties:false},
  enabled:ready,
  run:((p:{layers:string[]})=>{const c=comp(),refs=setKeyRefs(c,p.layers),style=c.layers.filter(l=>p.layers.includes(l.id)).flatMap(l=>styleKeyLanes(l).flatMap(x=>x.ticks.map(t=>({layer:l.id,lane:x.id,t}))));if(!refs.length&&!style.length)return expected('Those layers have no keys.');animationSession().selectKeys(refs);animationSession().setView({styleKeys:style});return {keys:refs.length+style.length};}) as (p:unknown)=>unknown}];
