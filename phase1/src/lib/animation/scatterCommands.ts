import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Composition,type Layer,type Vec2} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {evaluateMod} from './modifiers';
/** Scatter: place the ticked layers at random (anywhere in the frame), nudge them a little, or shuffle their positions among each other. One undo step, seeded. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const SCATTER_MODES=['frame','nudge','shuffle'] as const;export type ScatterMode=typeof SCATTER_MODES[number];
export const MAX_SCATTER_LAYERS=60,NUDGE_PX=60;
const r2=(n:number)=>Math.round(n*100)/100;
function rng(seed:number){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
/** New resting positions for `from` (current positions) in the given mode. Shuffle is a derangement-free permutation of the same positions. */
export function scatterTargets(mode:ScatterMode,from:readonly Vec2[],w:number,h:number,seed:number):Vec2[]{
 const rnd=rng(seed);
 if(mode==='frame')return from.map(()=>[r2(rnd()*w),r2(rnd()*h)] as Vec2);
 if(mode==='nudge')return from.map(p=>[r2(p[0]+(rnd()*2-1)*NUDGE_PX),r2(p[1]+(rnd()*2-1)*NUDGE_PX)] as Vec2);
 const idx=from.map((_,i)=>i);for(let i=idx.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]];}
 return idx.map(i=>from[i]);
}
export const scatterSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.scatter',title:'Scatter, nudge or shuffle the ticked layers',category:'Edit',level:'ui',keywords:['animation','scatter','random','randomize','shuffle','nudge','confetti','stars','jitter','swap'],
 params:{type:'object',properties:{mode:{enum:[...SCATTER_MODES]},seed:{type:'integer',minimum:0,maximum:99999},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:2,maxItems:MAX_SCATTER_LAYERS}},required:['mode'],additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>1;},
 run:((p:{mode?:ScatterMode;seed?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c:Composition|undefined=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!p.mode||!SCATTER_MODES.includes(p.mode))return expected('Choose scatter, nudge or shuffle.');
  const seed=p.seed??Math.floor(Math.random()*99999);
  const all=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_SCATTER_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l);
  const ls=all.filter(l=>!l.locked&&l.kind!=='audio'&&(p.mode==='nudge'||!l.parent));
  if(ls.length<(p.mode==='nudge'?1:2))return expected(p.mode==='nudge'?'Tick at least one unlocked layer.':'Tick at least two unlocked layers without a parent layer.');
  const t0=c.workArea.in,from=ls.map(l=>evaluateMod(l.transform.position,t0) as Vec2),to=scatterTargets(p.mode,from,c.width,c.height,seed),edits:Edit[]=[];
  ls.forEach((l,i)=>{const dx=to[i][0]-from[i][0],dy=to[i][1]-from[i][1],pos=l.transform.position;
   if(!dx&&!dy)return;
   if(pos.keys.length)for(const k of pos.keys){const v=k.v as Vec2;edits.push({type:'prop.set',layer:l.id,prop:'position',t:k.t,value:[r2(v[0]+dx),r2(v[1]+dy)] as never});}
   else edits.push({type:'prop.set',layer:l.id,prop:'position',t:t0,value:to[i] as never});});
  if(!edits.length)return expected('Nothing moved. Try again for a different result.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {moved:ls.length,skipped:all.length-ls.length,mode:p.mode,seed};
 }) as (p:unknown)=>unknown}];
