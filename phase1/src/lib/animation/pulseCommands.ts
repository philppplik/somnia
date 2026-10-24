import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,newId,type Composition,type Layer,type LayerEffect} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {defaultEffect} from './effects';
import {snapToFrame} from './time';
/** Glow pulse: the ticked layers get a glow (the first existing one is reused) whose strength breathes up and down over the work area. Keyed, so it exports and loops like any other animation. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_PULSE_LAYERS=30,MAX_PULSES=12,PULSE_LOW=0.25,PULSE_HIGH=1,MAX_EFFECTS=8;
/** Key times (ticks) and strengths: starts high, falls to low and comes back, `cycles` times, ending on the starting value. */
export function pulseKeys(a:number,b:number,cycles:number,fps:Composition['fps']):{t:number;v:number}[]{
 const out:{t:number;v:number}[]=[],n=cycles*2;let prev=-1;
 for(let i=0;i<=n;i++){const t=i===n?b:snapToFrame(a+(b-a)*i/n,fps);if(t<=prev)continue;prev=t;out.push({t,v:i%2===0?PULSE_HIGH:PULSE_LOW});}
 return out;
}
export const pulseSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.pulseGlow',title:'Pulse a glow on the ticked layers',category:'Edit',level:'ui',keywords:['animation','pulse','glow','breathe','neon','heartbeat','light','effect','loop'],
 params:{type:'object',properties:{cycles:{type:'integer',minimum:1,maximum:MAX_PULSES},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_PULSE_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{cycles?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c:Composition|undefined=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const cycles=p.cycles??3;if(!Number.isInteger(cycles)||cycles<1||cycles>MAX_PULSES)return expected(`Pulses are 1 to ${MAX_PULSES}.`);
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_PULSE_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.kind!=='audio'&&l.kind!=='null');
  if(!ls.length)return expected('Tick at least one unlocked layer that can show a glow.');
  const a=snapToFrame(c.workArea.in,c.fps),b=c.workArea.out;if(b-a<=0)return expected('The work area is empty.');
  const keys=pulseKeys(a,b,cycles,c.fps);if(keys.length<3)return expected('The work area is too short for that many pulses.');
  const edits:Edit[]=[];let added=0,skipped=0;
  for(const l of ls){
   let fx:LayerEffect|undefined=l.effects?.find(x=>x.kind==='glow');
   if(!fx){if((l.effects?.length??0)>=MAX_EFFECTS){skipped++;continue;}fx=defaultEffect('glow',newId('effect'),l.source.color??'#ffffff');added++;edits.push({type:'layer.effects',layer:l.id,effects:[...(l.effects??[]),fx]});}
   else for(const k of fx.animation?.keys??[])edits.push({type:'effect.key.remove',layer:l.id,effect:fx.id,t:k.t});
   edits.push({type:'effect.animate',layer:l.id,effect:fx.id,on:true,t:a});
   for(const k of keys)edits.push({type:'effect.amount',layer:l.id,effect:fx.id,value:k.v,t:k.t});}
  if(!edits.length)return expected('These layers already have the maximum number of effects.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {pulsing:ls.length-skipped,glowsAdded:added,skipped,cycles};
 }) as (p:unknown)=>unknown}];
