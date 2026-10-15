import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Layer,type PropValue,type TransformKey} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {evaluate} from './interpolate';
import {frameToTick,snapToFrame} from './time';
/** Wave: a sine wave runs through the ticked layers in tick order, each one a step behind the one before. Bobs (position y), swings (rotation) or breathes (scale). Baked as linear keys over the work area. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const WAVE_KINDS=['bob','swing','breathe'] as const;
export type WaveKind=typeof WAVE_KINDS[number];
export const MAX_WAVE_LAYERS=30,MAX_WAVE_KEYS=120,PHASE_STEP=45;
export const WAVE_DEFAULTS:Record<WaveKind,{amount:number;max:number}>={bob:{amount:24,max:400},swing:{amount:12,max:90},breathe:{amount:10,max:80}};
const round=(n:number)=>Math.round(n*100)/100;
/** Key times in ticks: every `step` ticks from `a`, always ending exactly on `b`. */
export function waveTimes(a:number,b:number,step:number):number[]{const out:number[]=[];for(let t=a;t<b;t+=step)out.push(t);out.push(b);return out;}
/** Offset of layer `i` at tick offset `dt` from the start: sine with a 45 degree step per layer, 0 at the start for the first layer. */
export const waveOffset=(i:number,dt:number,period:number,amount:number)=>amount*Math.sin(2*Math.PI*dt/period-i*PHASE_STEP*Math.PI/180);
export function applyWave(kind:WaveKind,base:PropValue,off:number):PropValue{
 if(kind==='bob'){const v=base as readonly number[];return [round(v[0]),round(v[1]+off)] as unknown as PropValue;}
 if(kind==='swing')return round((base as number)+off) as unknown as PropValue;
 const v=base as readonly number[],k=Math.max(0,1+off/100);return [round(v[0]*k),round(v[1]*k)] as unknown as PropValue;
}
const PROP:Record<WaveKind,TransformKey>={bob:'position',swing:'rotation',breathe:'scale'};
export const waveSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.wave',title:'Run a wave through the ticked layers',category:'Edit',level:'ui',keywords:['animation','wave','bob','swing','breathe','ripple','sine','follow','offset','phase','row','letters'],
 params:{type:'object',properties:{kind:{enum:[...WAVE_KINDS]},amount:{type:'number',minimum:1,maximum:400},periodFrames:{type:'integer',minimum:6,maximum:300},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_WAVE_LAYERS}},required:['kind'],additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{kind:WaveKind;amount?:number;periodFrames?:number;layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!WAVE_KINDS.includes(p?.kind))return expected('Unknown wave kind.');
  const def=WAVE_DEFAULTS[p.kind],amount=p.amount??def.amount,pf=p.periodFrames??30;
  if(!Number.isFinite(amount)||amount<=0||amount>def.max)return expected(`The wave size is above 0 and up to ${def.max}.`);
  if(!Number.isInteger(pf)||pf<6||pf>300)return expected('One wave cycle is 6 to 300 frames.');
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_WAVE_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.kind!=='audio');
  if(!ls.length)return expected('Tick at least one unlocked layer.');
  const a=snapToFrame(c.workArea.in,c.fps),b=c.workArea.out;if(b<=a)return expected('The work area is empty.');
  const frames=Math.round((b-a)/frameToTick(1,c.fps)),stepFrames=Math.max(Math.ceil(pf/8),Math.ceil(frames/(MAX_WAVE_KEYS-1)),1),step=frameToTick(stepFrames,c.fps),period=frameToTick(pf,c.fps);
  const times=waveTimes(a,b,step),prop=PROP[p.kind];
  const edits:Edit[]=[];let done=0,skipped=0;
  ls.forEach((l,i)=>{
   const pr=l.transform[prop];if(pr.modifiers?.length){skipped++;return;}
   const base=times.map(t=>evaluate(pr,t) as PropValue);
   for(const k of pr.keys)if(k.t>=a&&k.t<=b)edits.push({type:'key.remove',layer:l.id,prop,t:k.t});
   times.forEach((t,j)=>edits.push({type:'key.add',layer:l.id,prop,t},{type:'prop.set',layer:l.id,prop,t,value:applyWave(p.kind,base[j],waveOffset(i,t-a,period,amount)) as never},{type:'key.interp',layer:l.id,prop,t,interp:'linear'}));
   done++;});
  if(!done)return expected('The ticked layers have modifiers (wiggle, loop, link, spring) on that property.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:done,skipped,keys:times.length,kind:p.kind};
 }) as (p:unknown)=>unknown}];
