import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Composition,type Layer,type PropValue,type TransformKey} from './model';
import {frameToTick,snapToFrame} from './time';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {evaluateMod} from './modifiers';
import {linkResolver} from './scene';
/** Bake modifiers: wiggle, loop and link become plain keys over the work area, then the modifiers are removed. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_BAKE_LAYERS=50,MAX_BAKE_STEP=10,MAX_BAKE_KEYS=600;
const KEYS:TransformKey[]=['position','scale','rotation','opacity','anchor'];
const r2=(n:number)=>Math.round(n*100)/100;
const round=(v:PropValue):PropValue=>typeof v==='number'?r2(v):[r2(v[0]),r2(v[1])];
/** Ticks sampled by a bake: every `step` frames from the work area start up to (not including) its end. */
export function bakeTicks(c:Composition,step:number):number[]{
 const dt=frameToTick(step,c.fps),a=snapToFrame(c.workArea.in,c.fps),b=c.workArea.out,out:number[]=[];
 for(let t=a;t<b&&out.length<=MAX_BAKE_KEYS;t+=dt)out.push(t);
 return out;
}
/** Edits that turn the modifiers of one layer into keys at `ticks` (none when it has no modifier). */
export function bakeEdits(c:Composition,l:Layer,ticks:readonly number[]):{edits:Edit[];props:number}{
 const edits:Edit[]=[];let props=0;const links=linkResolver(c);
 for(const k of KEYS){const p=l.transform[k],mods=p.modifiers??[];if(!mods.length)continue;props++;
  const lo=ticks[0],hi=ticks[ticks.length-1];
  for(const key of p.keys)if(key.t>=lo&&key.t<=hi)edits.push({type:'key.remove',layer:l.id,prop:k,t:key.t});
  const vals=ticks.map(t=>round(evaluateMod(p,t,links)));
  ticks.forEach((t,i)=>{edits.push({type:'key.add',layer:l.id,prop:k,t});edits.push({type:'prop.set',layer:l.id,prop:k,value:vals[i],t});});
  for(let i=mods.length-1;i>=0;i--)edits.push({type:'modifier.remove',layer:l.id,prop:k,index:i});}
 return {edits,props};
}
export const modifierBakeSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.modifiers.bake',title:'Bake wiggle, loop and link modifiers of the selected layers into keys',category:'Edit',level:'ui',keywords:['animation','modifier','bake','wiggle','loop','link','keys','convert','freeze','expression'],
 params:{type:'object',properties:{step:{type:'integer',minimum:1,maximum:MAX_BAKE_STEP},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_BAKE_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.some(l=>KEYS.some(k=>(l.transform[k].modifiers??[]).length>0));},
 run:((p:{step?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const step=p.step??1;if(!Number.isInteger(step)||step<1||step>MAX_BAKE_STEP)return expected(`The key step must be 1 to ${MAX_BAKE_STEP} frames.`);
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_BAKE_LAYERS).map(id=>findLayer(c,id)).filter(l=>!!l) as Layer[];
  if(!ls.length)return expected('Select at least one layer.');
  const withMods=ls.filter(l=>KEYS.some(k=>(l.transform[k].modifiers??[]).length>0));if(!withMods.length)return expected('The selected layers have no wiggle, loop or link modifier.');
  const open=withMods.filter(l=>!l.locked);if(!open.length)return expected('The layers with modifiers are locked.');
  const ticks=bakeTicks(c,step);if(!ticks.length)return expected('The work area is empty.');
  if(ticks.length>MAX_BAKE_KEYS)return expected(`That would add more than ${MAX_BAKE_KEYS} keys per property. Use a larger step or a shorter work area.`);
  const edits:Edit[]=[];let props=0;for(const l of open){const r=bakeEdits(c,l,ticks);edits.push(...r.edits);props+=r.props;}
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {properties:props,keysEach:ticks.length,skippedLocked:withMods.length-open.length};
 }) as (p:unknown)=>unknown}];
