import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,newId,type Composition,type Layer,type Vec2} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds,clearLayerSet,toggleLayerInSet} from './layerSet';
import {parentMatrix,invertMatrix} from './scene';
import {evaluateMod} from './modifiers';
import {frameToTick,snapToFrame} from './time';
/** Burst: copies of the ticked layer fly out from where it is at the playhead, spin, shrink and fade away (confetti, sparks, splashes). Seeded, so the same seed gives the same burst. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_BURST=30,MIN_BURST=3,KEY_STEPS=[0,0.25,0.5,0.75,1] as const;
const r2=(n:number)=>Math.round(n*100)/100;
function rng(seed:number){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export interface Piece{angle:number;dist:number;spin:number}
/** Evenly spread directions with a little jitter, distances 60 to 100 percent of `distance`, spin up to 1.5 turns either way. */
export function burstPieces(count:number,seed:number,distance:number):Piece[]{
 const rnd=rng(seed),out:Piece[]=[];
 for(let i=0;i<count;i++)out.push({angle:r2(2*Math.PI*(i+rnd()*0.6)/count),dist:r2(distance*(0.6+0.4*rnd())),spin:r2((rnd()*2-1)*540)});
 return out;
}
/** Offset from the start at progress `u`: fast out, slowing down, with a little fall at the end. */
export const burstOffset=(p:Piece,u:number,gravity:number):Vec2=>{const e=1-(1-u)*(1-u);return [p.dist*Math.cos(p.angle)*e,p.dist*Math.sin(p.angle)*e+gravity*p.dist*u*u];};
export const burstSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.burst',title:'Burst copies of the layer outwards from the playhead',category:'Edit',level:'ui',keywords:['animation','burst','explode','confetti','particles','sparks','splash','emitter','scatter','copies','fireworks'],
 params:{type:'object',properties:{count:{type:'integer',minimum:MIN_BURST,maximum:MAX_BURST},seconds:{type:'number',minimum:0.2,maximum:5},distance:{type:'number',minimum:20,maximum:3000},seed:{type:'integer',minimum:0,maximum:99999},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:1}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{count?:number;seconds?:number;distance?:number;seed?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c:Composition|undefined=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const n=p.count??12,secs=p.seconds??1,dist=p.distance??240,seed=p.seed??1;
  if(!Number.isInteger(n)||n<MIN_BURST||n>MAX_BURST)return expected(`A burst is ${MIN_BURST} to ${MAX_BURST} copies.`);
  if(!Number.isFinite(secs)||secs<0.2||secs>5)return expected('The burst lasts 0.2 to 5 seconds.');
  if(!Number.isFinite(dist)||dist<20||dist>3000)return expected('The distance is 20 to 3000 pixels.');
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].filter(id=>!!findLayer(c,id));
  if(ids.length!==1)return expected('Select exactly one layer to burst.');
  const l=findLayer(c,ids[0]) as Layer;if(l.locked||l.kind==='audio'||l.kind==='null')return expected('This layer is locked or has nothing to show.');
  if(c.layers.length+n>500)return expected('The composition would get too many layers.');
  const t0=snapToFrame(s.getState().view.playhead,c.fps),end=Math.min(c.duration,t0+frameToTick(Math.max(2,Math.round(secs*c.fps.num/c.fps.den)),c.fps));
  if(end<=t0)return expected('Move the playhead earlier: the burst needs room before the end of the composition.');
  if(l.inT>=end||l.outT<=t0)return expected('The layer is not visible at the playhead.');
  const inv=invertMatrix(parentMatrix(c,l,t0));if(!inv)return expected('The parent layer cannot be inverted.');
  const start=evaluateMod(l.transform.position,t0) as Vec2,sc=evaluateMod(l.transform.scale,t0) as Vec2,rot=evaluateMod(l.transform.rotation,t0) as number,op=evaluateMod(l.transform.opacity,t0) as number;
  const pieces=burstPieces(n,seed,dist),made=pieces.map(()=>newId('layer')),edits:Edit[]=[];
  made.forEach((id,i)=>{const pc=pieces[i];
   edits.push({type:'layers.duplicate',layers:[l.id],ids:[id]});
   for(const prop of ['position','scale','rotation','opacity'] as const)for(const k of l.transform[prop].keys)edits.push({type:'key.remove',layer:id,prop,t:k.t});
   edits.push({type:'layer.timing',layer:id,inT:t0,outT:end});
   const put=(prop:'position'|'scale'|'rotation'|'opacity',t:number,v:unknown)=>edits.push({type:'key.add',layer:id,prop,t},{type:'prop.set',layer:id,prop,t,value:v as never},{type:'key.interp',layer:id,prop,t,interp:'linear'});
   for(const u of KEY_STEPS){const t=t0+Math.round((end-t0)*u),o=burstOffset(pc,u,0.5);
    put('position',t,[r2(start[0]+inv[0]*o[0]+inv[2]*o[1]),r2(start[1]+inv[1]*o[0]+inv[3]*o[1])]);
    put('rotation',t,r2(rot+pc.spin*u));}
   put('scale',t0,[sc[0],sc[1]]);put('scale',end,[r2(sc[0]*0.3),r2(sc[1]*0.3)]);
   put('opacity',t0,op);put('opacity',t0+Math.round((end-t0)*0.5),op);put('opacity',end,0);});
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  clearLayerSet();made.forEach(id=>toggleLayerInSet(id));s.setView({selectedLayer:l.id,selectedKey:null});
  return {copies:n,from:t0,to:end,seed};
 }) as (p:unknown)=>unknown}];
