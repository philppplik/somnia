import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Composition,type Layer,type Vec2} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {worldMatrix} from './scene';
import {evaluateMod} from './modifiers';
import {frameToTick,tickToFrame} from './time';
/** Reach (two-bone IK): upper arm, forearm and hand are three layers hanging from each other; the chain bends so the hand's anchor lands on a fourth layer's anchor. Baked rotation keys on the upper and lower layer over the work area, not a live constraint. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_IK_KEYS=120;
const RAD=Math.PI/180;
const anchorWorld=(c:Composition,l:Layer,t:number):Vec2=>{const m=worldMatrix(c,l,t),a=evaluateMod(l.transform.anchor,t) as Vec2;return [m[0]*a[0]+m[2]*a[1]+m[4],m[1]*a[0]+m[3]*a[1]+m[5]];};
const det=(c:Composition,l:Layer,t:number)=>{const m=worldMatrix(c,l,t);return m[0]*m[3]-m[1]*m[2];};
const isAncestor=(c:Composition,anc:string,l:Layer):boolean=>{const seen=new Set<string>();let cur=l.parent?findLayer(c,l.parent):undefined;while(cur&&!seen.has(cur.id)){if(cur.id===anc)return true;seen.add(cur.id);cur=cur.parent?findLayer(c,cur.parent):undefined;}return false;};
/** Rotation changes in degrees for the upper and lower bone so the tip reaches the target, from the current pose. `bend` is +1 or -1 and keeps the elbow on the same side. A target out of reach stretches the chain straight at it. */
export function ikDeltas(s:Vec2,e:Vec2,h:Vec2,target:Vec2,bend:number):{d1:number;d2:number}{
 const l1=Math.hypot(e[0]-s[0],e[1]-s[1]),l2=Math.hypot(h[0]-e[0],h[1]-e[1]);
 const th1=Math.atan2(e[1]-s[1],e[0]-s[0]),th2=Math.atan2(h[1]-e[1],h[0]-e[0]);
 const dx=target[0]-s[0],dy=target[1]-s[1],d=Math.min(l1+l2-1e-6,Math.max(Math.abs(l1-l2)+1e-6,Math.hypot(dx,dy)));
 const reach=Math.hypot(dx,dy)>=l1+l2,A=reach?0:Math.acos(Math.max(-1,Math.min(1,(l1*l1+d*d-l2*l2)/(2*l1*d))));
 const n1=Math.atan2(dy,dx)-bend*A,ex=s[0]+l1*Math.cos(n1),ey=s[1]+l1*Math.sin(n1);
 // Aim the forearm at the true target when it is reachable; otherwise along the same line.
 const n2=reach?n1:Math.atan2(target[1]-ey,target[0]-ex);
 const wrap=(r:number)=>{let x=r%(2*Math.PI);if(x>Math.PI)x-=2*Math.PI;if(x<-Math.PI)x+=2*Math.PI;return x;};
 const d1=wrap(n1-th1);
 return {d1:d1/RAD,d2:wrap(n2-(th2+d1))/RAD};
}
export function ikKeys(c:Composition,up:Layer,lo:Layer,hand:Layer,target:Layer,a:number,b:number):{up:{t:number;v:number}[];lo:{t:number;v:number}[]}{
 const f0=tickToFrame(a,c.fps),f1=tickToFrame(b,c.fps),step=Math.max(1,Math.ceil((f1-f0)/(MAX_IK_KEYS-1)));
 const fs:number[]=[];for(let f=f0;f<f1;f+=step)fs.push(f);fs.push(f1);
 const cross0=(()=>{const s=anchorWorld(c,up,a),e=anchorWorld(c,lo,a),h=anchorWorld(c,hand,a);const x=(e[0]-s[0])*(h[1]-e[1])-(e[1]-s[1])*(h[0]-e[0]);return x<0?-1:1;})();
 let pu=evaluateMod(up.transform.rotation,a) as number,pl=evaluateMod(lo.transform.rotation,a) as number;
 const out={up:[] as {t:number;v:number}[],lo:[] as {t:number;v:number}[]};
 for(const f of fs){const t=frameToTick(f,c.fps);
  const {d1,d2}=ikDeltas(anchorWorld(c,up,t),anchorWorld(c,lo,t),anchorWorld(c,hand,t),anchorWorld(c,target,t),cross0);
  let vu=(evaluateMod(up.transform.rotation,t) as number)+d1,vl=(evaluateMod(lo.transform.rotation,t) as number)+d2;
  vu+=360*Math.round((pu-vu)/360);vl+=360*Math.round((pl-vl)/360);pu=vu;pl=vl;
  out.up.push({t,v:Math.round(vu*100)/100});out.lo.push({t,v:Math.round(vl*100)/100});}
 return out;
}
export const ikSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.ik',title:'Reach the last ticked layer with a three-layer arm',category:'Edit',level:'ui',keywords:['animation','ik','inverse kinematics','reach','arm','leg','limb','chain','bone','rig','hand','target','elbow','knee'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:4,maxItems:4}},additionalProperties:false},
 // The Rig menu passes its ticked layers in tick order: upper arm, forearm, hand, target.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>3;},
 run:((p:{layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l);
  if(ids.length!==4)return expected('Tick four layers in this order: upper arm, forearm, hand, target.');
  const [up,lo,hand,target]=ids;
  if(lo.parent!==up.id||hand.parent!==lo.id)return expected('The forearm must hang from the upper arm and the hand from the forearm.');
  if(isAncestor(c,up.id,target)||target.id===up.id)return expected('The target hangs from the arm it should be reached by.');
  if(up.locked||lo.locked)return expected('The upper arm or the forearm is locked.');
  for(const l of [up,lo])if(l.transform.rotation.modifiers?.length)return expected('The arm has modifiers (wiggle, loop, link, spring) on its rotation.');
  const a=c.workArea.in,b=c.workArea.out;if(b<=a)return expected('The work area is empty.');
  if(det(c,up,a)<=0||det(c,lo,a)<=0)return expected('The arm is mirrored (negative scale), which this solver does not handle.');
  const k=ikKeys(c,up,lo,hand,target,a,b),edits:Edit[]=[];
  for(const [l,keys] of [[up,k.up],[lo,k.lo]] as const){
   for(const x of l.transform.rotation.keys)edits.push({type:'key.remove',layer:l.id,prop:'rotation',t:x.t});
   for(const x of keys)edits.push({type:'key.add',layer:l.id,prop:'rotation',t:x.t},{type:'prop.set',layer:l.id,prop:'rotation',t:x.t,value:x.v as never},{type:'key.interp',layer:l.id,prop:'rotation',t:x.t,interp:'linear'});}
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {upper:up.id,lower:lo.id,keys:k.up.length};
 }) as (p:unknown)=>unknown}];
