import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Layer} from './model';
import {frameToTick,snapToFrame} from './time';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {evaluate} from './interpolate';
/** Squash and stretch: scale keys that stretch a layer along the axis it moves fastest on and squash the other axis, from the speed of its position. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_SQUASH_LAYERS=50,MAX_SQUASH_KEYS=600,MAX_SQUASH_STEP=30;
const round=(n:number)=>Math.round(n*100)/100;
/** Per-axis factors (1 = unchanged) for a speed in px per frame. Stretch grows with the speed on an axis and the other axis gives the volume back; the ratio is held between 1/2 and 2. */
export function squashFactors(vx:number,vy:number,amount:number):{x:number;y:number}{
 const k=amount/100*0.02,a=1+k*Math.abs(vx),b=1+k*Math.abs(vy),r=Math.min(2,Math.max(0.5,a/b));
 return {x:round(Math.sqrt(r)),y:round(1/Math.sqrt(r))};
}
/** Scale keys for one layer over its position keys: [tick,[x,y]] every `step` frames plus the last key, or null when the position is not animated. */
export function squashKeys(l:Layer,fps:{num:number;den:number},step:number,amount:number):{t:number;v:[number,number]}[]|null{
 const ks=l.transform.position.keys;if(ks.length<2)return null;
 const t0=snapToFrame(ks[0].t,fps),t1=snapToFrame(ks[ks.length-1].t,fps),dt=frameToTick(step,fps),one=frameToTick(1,fps),half=Math.max(1,Math.round(one/2));
 const base=evaluate(l.transform.scale,t0) as readonly number[];
 const ticks:number[]=[];for(let t=t0;t<t1;t+=dt)ticks.push(t);ticks.push(t1);
 return ticks.map(t=>{const a=evaluate(l.transform.position,Math.max(t0,t-half)) as readonly number[],b=evaluate(l.transform.position,Math.min(t1,t+half)) as readonly number[];
  const span=Math.max(1,Math.min(t1,t+half)-Math.max(t0,t-half)),f=squashFactors((b[0]-a[0])*one/span,(b[1]-a[1])*one/span,amount);
  return {t,v:[round(base[0]*f.x),round(base[1]*f.y)] as [number,number]};});
}
export const layerSquashSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.squash',title:'Squash and stretch the selected layers from their motion',category:'Edit',level:'ui',keywords:['animation','layer','squash','stretch','bounce','cartoon','scale','speed','velocity','motion','principle'],
 params:{type:'object',properties:{amount:{type:'integer',minimum:1,maximum:100},step:{type:'integer',minimum:1,maximum:MAX_SQUASH_STEP},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_SQUASH_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.some(l=>l.transform.position.keys.length>1);},
 run:((p:{amount?:number;step?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const amount=p.amount??60,step=p.step??2;
  if(!Number.isInteger(amount)||amount<1||amount>100)return expected('The amount must be a whole number from 1 to 100.');
  if(!Number.isInteger(step)||step<1||step>MAX_SQUASH_STEP)return expected(`The key step must be 1 to ${MAX_SQUASH_STEP} frames.`);
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_SQUASH_LAYERS).map(id=>findLayer(c,id)).filter(l=>!!l&&l.kind!=='audio') as Layer[];
  if(!ls.length)return expected('Select at least one layer.');
  const moving=ls.filter(l=>l.transform.position.keys.length>1);if(!moving.length)return expected('None of the layers has an animated position.');
  const open=moving.filter(l=>!l.locked);if(!open.length)return expected('The layers with a moving position are locked.');
  const edits:Edit[]=[];let done=0;
  for(const l of open){
   const ks=squashKeys(l,c.fps,step,amount);if(!ks)continue;
   if(ks.length>MAX_SQUASH_KEYS)return expected(`That would add ${ks.length} scale keys to one layer. Use a larger step (at most ${MAX_SQUASH_KEYS} keys).`);
   const pos=l.transform.position.keys,t0=pos[0].t,t1=pos[pos.length-1].t;
   for(const k of l.transform.scale.keys)if(k.t>=t0-1&&k.t<=t1+1)edits.push({type:'key.remove',layer:l.id,prop:'scale',t:k.t});
   for(const k of ks){edits.push({type:'key.add',layer:l.id,prop:'scale',t:k.t});edits.push({type:'prop.set',layer:l.id,prop:'scale',value:k.v,t:k.t});}
   done++;
  }
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:done,skippedLocked:moving.length-open.length};
 }) as (p:unknown)=>unknown}];
