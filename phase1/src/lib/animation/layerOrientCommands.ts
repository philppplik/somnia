import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Layer} from './model';
import {frameToTick,snapToFrame} from './time';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {evaluate} from './interpolate';
/** Orient to path: rotation keys that make a layer face the way its position moves. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_ORIENT_LAYERS=50,MAX_ORIENT_KEYS=600,MAX_ORIENT_STEP=30;
const round=(n:number)=>Math.round(n*100)/100;
/** Angles in degrees made continuous: each one is moved by whole turns to sit within 180 degrees of the one before. */
export function unwrapAngles(a:readonly number[]):number[]{const out:number[]=[];let prev=0;a.forEach((x,i)=>{let v=x;if(i>0){while(v-prev>180)v-=360;while(v-prev<-180)v+=360;}out.push(v);prev=v;});return out;}
/** Heading in degrees (0 = moving right, 90 = moving down) of a position moving by dx,dy, or null when it hardly moves. */
export const headingOf=(dx:number,dy:number):number|null=>Math.hypot(dx,dy)<1e-6?null:Math.atan2(dy,dx)*180/Math.PI;
/** Rotation keys for one layer over its position keys: [tick, degrees] every `step` frames plus the last key, or null when the position is not animated. */
export function orientKeys(l:Layer,fps:{num:number;den:number},step:number,offset:number):{t:number;v:number}[]|null{
 const ks=l.transform.position.keys;if(ks.length<2)return null;
 const t0=snapToFrame(ks[0].t,fps),t1=snapToFrame(ks[ks.length-1].t,fps),dt=frameToTick(step,fps),half=Math.max(1,Math.round(frameToTick(1,fps)/2));
 const ticks:number[]=[];for(let t=t0;t<t1;t+=dt)ticks.push(t);ticks.push(t1);
 const raw=ticks.map(t=>{const a=evaluate(l.transform.position,Math.max(t0,t-half)) as readonly number[],b=evaluate(l.transform.position,Math.min(t1,t+half)) as readonly number[];return headingOf(b[0]-a[0],b[1]-a[1]);});
 if(raw.every(x=>x===null))return [];
 let last=raw.find(x=>x!==null) as number;const filled=raw.map(x=>{if(x!==null)last=x;return last;});
 return unwrapAngles(filled).map((v,i)=>({t:ticks[i],v:round(v+offset)}));
}
export const layerOrientSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.orient',title:'Rotate the selected layers to face along their motion path',category:'Edit',level:'ui',keywords:['animation','layer','orient','path','auto-orient','rotate','face','direction','motion','heading','position'],
 params:{type:'object',properties:{offset:{type:'integer',minimum:-180,maximum:180},step:{type:'integer',minimum:1,maximum:MAX_ORIENT_STEP},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_ORIENT_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.some(l=>l.transform.position.keys.length>1);},
 run:((p:{offset?:number;step?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const offset=p.offset??0,step=p.step??2;
  if(!Number.isInteger(offset)||offset<-180||offset>180)return expected('The angle offset must be a whole number from -180 to 180.');
  if(!Number.isInteger(step)||step<1||step>MAX_ORIENT_STEP)return expected(`The key step must be 1 to ${MAX_ORIENT_STEP} frames.`);
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_ORIENT_LAYERS).map(id=>findLayer(c,id)).filter(l=>!!l&&l.kind!=='audio') as Layer[];
  if(!ls.length)return expected('Select at least one layer.');
  const moving=ls.filter(l=>l.transform.position.keys.length>1);if(!moving.length)return expected('None of the layers has an animated position.');
  const open=moving.filter(l=>!l.locked);if(!open.length)return expected('The layers with a moving position are locked.');
  const edits:Edit[]=[];let done=0,still=0;
  for(const l of open){
   const ks=orientKeys(l,c.fps,step,offset);if(!ks)continue;if(!ks.length){still++;continue;}
   if(ks.length>MAX_ORIENT_KEYS)return expected(`That would add ${ks.length} rotation keys to one layer. Use a larger step (at most ${MAX_ORIENT_KEYS} keys).`);
   const pos=l.transform.position.keys,t0=pos[0].t,t1=pos[pos.length-1].t;
   for(const k of l.transform.rotation.keys)if(k.t>=t0-1&&k.t<=t1+1)edits.push({type:'key.remove',layer:l.id,prop:'rotation',t:k.t});
   for(const k of ks){edits.push({type:'key.add',layer:l.id,prop:'rotation',t:k.t});edits.push({type:'prop.set',layer:l.id,prop:'rotation',value:k.v,t:k.t});}
   done++;
  }
  if(!edits.length)return expected('The layers do not move, so there is no direction to follow.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:done,skippedLocked:moving.length-open.length,notMoving:still};
 }) as (p:unknown)=>unknown}];
