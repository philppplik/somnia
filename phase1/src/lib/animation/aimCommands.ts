import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Composition,type Layer,type Vec2} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {worldMatrix,parentMatrix} from './scene';
import {evaluateMod} from './modifiers';
import {frameToTick,tickToFrame} from './time';
/** Aim layers at a target layer: rotation keys over the work area that keep each layer's +x axis (plus an offset) pointing at the target. Baked keys, not a live constraint. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_AIM_KEYS=120,MAX_AIM_LAYERS=20;
const anchorWorld=(c:Composition,l:Layer,t:number):Vec2=>{const m=worldMatrix(c,l,t),a=evaluateMod(l.transform.anchor,t) as Vec2;return [m[0]*a[0]+m[2]*a[1]+m[4],m[1]*a[0]+m[3]*a[1]+m[5]];};
const isAncestor=(c:Composition,anc:string,l:Layer):boolean=>{const seen=new Set<string>();let cur=l.parent?findLayer(c,l.parent):undefined;while(cur&&!seen.has(cur.id)){if(cur.id===anc)return true;seen.add(cur.id);cur=cur.parent?findLayer(c,cur.parent):undefined;}return false;};
/** Rotation keys (ticks and degrees) that aim `l` at `target`, unwrapped so the layer never spins the long way round. */
export function aimKeys(c:Composition,l:Layer,target:Layer,a:number,b:number,offset:number):{t:number;v:number}[]{
 const f0=tickToFrame(a,c.fps),f1=tickToFrame(b,c.fps),step=Math.max(1,Math.ceil((f1-f0)/(MAX_AIM_KEYS-1)));
 const fs:number[]=[];for(let f=f0;f<f1;f+=step)fs.push(f);fs.push(f1);
 let prev=evaluateMod(l.transform.rotation,a) as number;const out:{t:number;v:number}[]=[];
 for(const f of fs){const t=frameToTick(f,c.fps),p=anchorWorld(c,l,t),q=anchorWorld(c,target,t),pm=parentMatrix(c,l,t);
  const phi=Math.atan2(q[1]-p[1],q[0]-p[0])*180/Math.PI+offset,rp=Math.atan2(pm[1],pm[0])*180/Math.PI;
  let v=phi-rp;v+=360*Math.round((prev-v)/360);prev=v;out.push({t,v:Math.round(v*100)/100});}
 return out;
}
export const aimSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.aim',title:'Aim layers at the first ticked layer',category:'Edit',level:'ui',keywords:['animation','aim','look at','point','face','track','target','constraint','rotate','eyes','turret'],
 params:{type:'object',properties:{offset:{type:'number',minimum:-360,maximum:360},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:2,maxItems:MAX_AIM_LAYERS+1}},additionalProperties:false},
 // The Rig menu passes its own ticked layers: the first is the target, the others aim at it.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>1;},
 run:((p:{offset?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const offset=p.offset??0;if(!Number.isFinite(offset)||Math.abs(offset)>360)return expected('The offset is -360 to 360 degrees.');
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_AIM_LAYERS+1).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l);
  if(ids.length<2)return expected('Tick the target first, then the layers that should aim at it.');
  const target=ids[0],aimers=ids.slice(1).filter(l=>!l.locked&&l.kind!=='audio');
  if(!aimers.length)return expected('The layers that should aim are locked.');
  if(aimers.some(l=>isAncestor(c,l.id,target)))return expected('The target hangs from a layer that should aim at it.');
  if(aimers.some(l=>aimers.some(o=>o!==l&&isAncestor(c,o.id,l))))return expected('Tick layers that do not hang from each other.');
  const a=c.workArea.in,b=c.workArea.out;if(b<=a)return expected('The work area is empty.');
  const edits:Edit[]=[];
  for(const l of aimers){
   for(const k of l.transform.rotation.keys)edits.push({type:'key.remove',layer:l.id,prop:'rotation',t:k.t});
   for(const k of aimKeys(c,l,target,a,b,offset))edits.push({type:'key.add',layer:l.id,prop:'rotation',t:k.t},{type:'prop.set',layer:l.id,prop:'rotation',t:k.t,value:k.v as never},{type:'key.interp',layer:l.id,prop:'rotation',t:k.t,interp:'linear'});}
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {aimed:aimers.length,target:target.id,keys:edits.filter(e=>e.type==='key.add').length};
 }) as (p:unknown)=>unknown}];
