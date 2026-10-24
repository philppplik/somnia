import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Layer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {evaluate} from './interpolate';
import {frameToTick,snapToFrame} from './time';
/** Spin: the ticked layers turn a whole number of times around their anchor over the work area. A whole number of turns ends where it started, so a loop stays seamless. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_SPIN_LAYERS=30,MAX_SPIN_TURNS=20,MAX_SPIN_KEYS=120;
const round=(n:number)=>Math.round(n*100)/100;
/** Sample times in ticks, evenly spaced and ending exactly on `b`. */
export function spinTimes(a:number,b:number,step:number):number[]{const out:number[]=[];for(let t=a;t<b;t+=step)out.push(t);out.push(b);return out;}
export const spinSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.spin',title:'Spin the ticked layers around their anchor',category:'Edit',level:'ui',keywords:['animation','spin','rotate','turn','revolve','loader','gear','wheel','rotation','loop','clockwise'],
 params:{type:'object',properties:{turns:{type:'integer',minimum:-MAX_SPIN_TURNS,maximum:MAX_SPIN_TURNS},ease:{type:'boolean'},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_SPIN_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{turns?:number;ease?:boolean;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const turns=p.turns??1;if(!Number.isInteger(turns)||turns===0||Math.abs(turns)>MAX_SPIN_TURNS)return expected(`Turns are a whole number from 1 to ${MAX_SPIN_TURNS}, negative for the other way.`);
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_SPIN_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.kind!=='audio');
  if(!ls.length)return expected('Tick at least one unlocked layer.');
  const a=snapToFrame(c.workArea.in,c.fps),b=c.workArea.out;if(b<=a)return expected('The work area is empty.');
  const frames=Math.round((b-a)/frameToTick(1,c.fps)),step=frameToTick(Math.max(1,Math.ceil(frames/(MAX_SPIN_KEYS-1))),c.fps);
  const edits:Edit[]=[];let done=0,skipped=0;
  for(const l of ls){
   const pr=l.transform.rotation;if(pr.modifiers?.length){skipped++;continue;}
   const simple=!pr.keys.length,times=simple?[a,b]:spinTimes(a,b,step);
   const base=times.map(t=>evaluate(pr,t) as number);
   for(const k of pr.keys)if(k.t>=a&&k.t<=b)edits.push({type:'key.remove',layer:l.id,prop:'rotation',t:k.t});
   times.forEach((t,j)=>{const v=round(base[j]+360*turns*(t-a)/(b-a));edits.push({type:'key.add',layer:l.id,prop:'rotation',t},{type:'prop.set',layer:l.id,prop:'rotation',t,value:v as never});
    if(p.ease!==true||!simple)edits.push({type:'key.interp',layer:l.id,prop:'rotation',t,interp:'linear'});});
   done++;}
  if(!done)return expected('The ticked layers have modifiers on their rotation.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:done,skipped,turns};
 }) as (p:unknown)=>unknown}];
