import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Composition,type Layer,type Vec2} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {worldMatrix,parentMatrix,invertMatrix} from './scene';
import {evaluateMod} from './modifiers';
import {frameToTick,tickToFrame} from './time';
/** Orbit layers around a target layer: position keys over the work area on a circle around the target, starting where each layer is now. Baked keys, not a live constraint. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_ORBIT_KEYS=120,MAX_ORBIT_LAYERS=20,MAX_ORBIT_TURNS=10;
const anchorWorld=(c:Composition,l:Layer,t:number):Vec2=>{const m=worldMatrix(c,l,t),a=evaluateMod(l.transform.anchor,t) as Vec2;return [m[0]*a[0]+m[2]*a[1]+m[4],m[1]*a[0]+m[3]*a[1]+m[5]];};
const isAncestor=(c:Composition,anc:string,l:Layer):boolean=>{const seen=new Set<string>();let cur=l.parent?findLayer(c,l.parent):undefined;while(cur&&!seen.has(cur.id)){if(cur.id===anc)return true;seen.add(cur.id);cur=cur.parent?findLayer(c,cur.parent):undefined;}return false;};
/** Position keys (ticks and parent space values) for `l` circling `target` by `turns` full turns (positive is clockwise on screen). Null when the layer sits on the target or its parent cannot be inverted. */
export function orbitKeys(c:Composition,l:Layer,target:Layer,a:number,b:number,turns:number):{t:number;v:Vec2}[]|null{
 const f0=tickToFrame(a,c.fps),f1=tickToFrame(b,c.fps),step=Math.max(1,Math.ceil((f1-f0)/(MAX_ORBIT_KEYS-1)));
 const fs:number[]=[];for(let f=f0;f<f1;f+=step)fs.push(f);fs.push(f1);
 const p0=anchorWorld(c,l,a),q0=anchorWorld(c,target,a),r=Math.hypot(p0[0]-q0[0],p0[1]-q0[1]);if(r<1)return null;
 const th0=Math.atan2(p0[1]-q0[1],p0[0]-q0[0]),out:{t:number;v:Vec2}[]=[];
 for(const f of fs){const t=frameToTick(f,c.fps),q=anchorWorld(c,target,t),u=(f-f0)/Math.max(1,f1-f0),th=th0+turns*2*Math.PI*u;
  const inv=invertMatrix(parentMatrix(c,l,t));if(!inv)return null;const x=q[0]+r*Math.cos(th),y=q[1]+r*Math.sin(th);
  out.push({t,v:[Math.round((inv[0]*x+inv[2]*y+inv[4])*100)/100,Math.round((inv[1]*x+inv[3]*y+inv[5])*100)/100]});}
 return out;
}
export const orbitSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.orbit',title:'Orbit layers around the first ticked layer',category:'Edit',level:'ui',keywords:['animation','orbit','circle','revolve','rotate around','planet','satellite','circular','path','target'],
 params:{type:'object',properties:{turns:{type:'integer',minimum:-MAX_ORBIT_TURNS,maximum:MAX_ORBIT_TURNS},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:2,maxItems:MAX_ORBIT_LAYERS+1}},additionalProperties:false},
 // The Rig menu passes its own ticked layers: the first is the centre, the others orbit it.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>1;},
 run:((p:{turns?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const turns=p.turns??1;if(!Number.isInteger(turns)||turns===0||Math.abs(turns)>MAX_ORBIT_TURNS)return expected(`Turns are a whole number from 1 to ${MAX_ORBIT_TURNS}, negative for counter-clockwise.`);
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_ORBIT_LAYERS+1).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l);
  if(ids.length<2)return expected('Tick the centre first, then the layers that should orbit it.');
  const target=ids[0],orbiters=ids.slice(1).filter(l=>!l.locked&&l.kind!=='audio');
  if(!orbiters.length)return expected('The layers that should orbit are locked.');
  if(orbiters.some(l=>isAncestor(c,l.id,target)))return expected('The centre hangs from a layer that should orbit it.');
  const a=c.workArea.in,b=c.workArea.out;if(b<=a)return expected('The work area is empty.');
  const edits:Edit[]=[];let skipped=0;
  for(const l of orbiters){
   const keys=orbitKeys(c,l,target,a,b,turns);if(!keys){skipped++;continue;}
   for(const k of l.transform.position.keys)edits.push({type:'key.remove',layer:l.id,prop:'position',t:k.t});
   for(const k of keys)edits.push({type:'key.add',layer:l.id,prop:'position',t:k.t},{type:'prop.set',layer:l.id,prop:'position',t:k.t,value:k.v as never},{type:'key.interp',layer:l.id,prop:'position',t:k.t,interp:'linear'});}
  if(!edits.length)return expected('The layers sit on the centre, so there is no circle to follow.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {orbiting:orbiters.length-skipped,skipped,keys:edits.filter(e=>e.type==='key.add').length};
 }) as (p:unknown)=>unknown}];
