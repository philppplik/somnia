import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Composition,type Layer,type PropValue,type TransformKey} from './model';
import {frameToTick,snapToFrame} from './time';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {evaluate} from './interpolate';
/** Close loop: every animated property gets a key at the loop end with the value it has at the loop start, so a GIF or video loops without a jump. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_LOOP_LAYERS=50;
const PROPS:TransformKey[]=['position','scale','rotation','opacity','anchor'];
const same=(a:PropValue,b:PropValue)=>typeof a==='number'||typeof b==='number'?a===b:a[0]===b[0]&&a[1]===b[1];
/** Last frame of the work area, in ticks. */
export const loopEnd=(c:Composition)=>snapToFrame(Math.max(c.workArea.in,c.workArea.out-frameToTick(1,c.fps)),c.fps);
/** Edits that close the loop of one layer between `t0` and `t1`; `beyond` counts properties skipped because they have keys after `t1`. */
export function closeLoopEdits(l:Layer,t0:number,t1:number):{edits:Edit[];props:number;beyond:number}{
 const edits:Edit[]=[];let props=0,beyond=0;
 for(const k of PROPS){const p=l.transform[k];if(!p.keys.length)continue;
  if(p.keys.some(x=>x.t>t1)){beyond++;continue;}
  const start=evaluate(p,t0),end=evaluate(p,t1);if(same(start,end))continue;
  if(!p.keys.some(x=>x.t===t1))edits.push({type:'key.add',layer:l.id,prop:k,t:t1});
  edits.push({type:'prop.set',layer:l.id,prop:k,value:start,t:t1});props++;}
 return {edits,props,beyond};
}
export const layerLoopSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.closeLoop',title:'Close the loop: end values equal the start values',category:'Edit',level:'ui',keywords:['animation','loop','seamless','close','cycle','gif','first','last','keys','start','end'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_LOOP_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.some(l=>PROPS.some(k=>l.transform[k].keys.length>0));},
 run:((p:{layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_LOOP_LAYERS).map(id=>findLayer(c,id)).filter(l=>!!l&&l.kind!=='audio') as Layer[];
  if(!ls.length)return expected('Select at least one layer.');
  const t0=snapToFrame(c.workArea.in,c.fps),t1=loopEnd(c);if(t1<=t0)return expected('The work area needs at least two frames.');
  const animated=ls.filter(l=>PROPS.some(k=>l.transform[k].keys.length>0));if(!animated.length)return expected('None of the layers has keys.');
  const open=animated.filter(l=>!l.locked);if(!open.length)return expected('The animated layers are locked.');
  const edits:Edit[]=[];let props=0,beyond=0;for(const l of open){const r=closeLoopEdits(l,t0,t1);edits.push(...r.edits);props+=r.props;beyond+=r.beyond;}
  if(!edits.length)return expected(beyond?'The keys run past the end of the work area, so nothing was changed.':'The end values already equal the start values.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {properties:props,skippedPastEnd:beyond,skippedLocked:animated.length-open.length};
 }) as (p:unknown)=>unknown}];
