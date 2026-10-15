import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,newId,makeTransform,prop,type Composition,type Layer} from './model';
import {EditError,type Edit} from './edit';
import {worldMatrix} from './scene';
import {frameToTick,tickToFrame} from './time';
/** A camera for the whole scene: a null layer at the composition centre that all other top level layers hang from, plus ready-made camera moves over the work area. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const CAMERA_NAME='Camera',CAMERA_MOVES=['pushIn','pullOut','panLeft','panRight','panUp','panDown','rollLeft','rollRight'] as const;
export type CameraMove=typeof CAMERA_MOVES[number];
export const findCamera=(c:Composition):Layer|undefined=>c.layers.find(l=>l.kind==='null'&&l.name===CAMERA_NAME);
export const MAX_FOLLOW_KEYS=120;
/** Camera position keys that keep `target` where it is at `a` while it moves: the target's world point is sampled with the camera at rest, and the camera moves against it. Linear keys, at most MAX_FOLLOW_KEYS. */
export function cameraFollowEdits(c:Composition,cam:Layer,target:Layer,a:number,b:number):Edit[]{
 const cx=c.width/2,cy=c.height/2,r2=(n:number)=>Math.round(n*100)/100;
 const rest:Layer={...cam,parent:null,transform:{...cam.transform,position:prop('vec2',[cx,cy]),scale:prop('vec2',[100,100]),rotation:prop('number',0)}};
 const rc:Composition={...c,layers:c.layers.map(l=>l.id===cam.id?rest:l)},tl=rc.layers.find(l=>l.id===target.id)??target;
 const pt=(t:number):[number,number]=>{const m=worldMatrix(rc,tl,t),an=tl.transform.anchor.value as unknown as [number,number];return [m[0]*an[0]+m[2]*an[1]+m[4],m[1]*an[0]+m[3]*an[1]+m[5]];};
 const f0=tickToFrame(a,c.fps),f1=tickToFrame(b,c.fps),step=Math.max(1,Math.ceil((f1-f0)/(MAX_FOLLOW_KEYS-1)));
 const ts:number[]=[];for(let f=f0;f<f1;f+=step)ts.push(frameToTick(f,c.fps));ts.push(frameToTick(f1,c.fps));
 const p0=pt(ts[0]),edits:Edit[]=[];
 for(const k of cam.transform.position.keys)edits.push({type:'key.remove',layer:cam.id,prop:'position',t:k.t});
 for(const t of ts){const p=pt(t);edits.push({type:'key.add',layer:cam.id,prop:'position',t},{type:'prop.set',layer:cam.id,prop:'position',t,value:[r2(cx-(p[0]-p0[0])),r2(cy-(p[1]-p0[1]))] as never},{type:'key.interp',layer:cam.id,prop:'position',t,interp:'linear'});}
 return edits;
}
/** Handheld shake: position keys every other frame (at most MAX_FOLLOW_KEYS), a fixed seed so the same call gives the same shake. Starts and ends at rest. */
export function cameraShakeEdits(c:Composition,cam:Layer,a:number,b:number,px:number):Edit[]{
 const cx=c.width/2,cy=c.height/2,r2=(n:number)=>Math.round(n*100)/100;let seed=2463534242;const rnd=()=>{seed^=seed<<13;seed>>>=0;seed^=seed>>>17;seed^=seed<<5;seed>>>=0;return seed/4294967296*2-1;};
 const f0=tickToFrame(a,c.fps),f1=tickToFrame(b,c.fps),step=Math.max(2,Math.ceil((f1-f0)/(MAX_FOLLOW_KEYS-1)));
 const fs:number[]=[];for(let f=f0;f<f1;f+=step)fs.push(f);fs.push(f1);
 const edits:Edit[]=cam.transform.position.keys.map((k):Edit=>({type:'key.remove',layer:cam.id,prop:'position',t:k.t}));
 fs.forEach((f,i)=>{const t=frameToTick(f,c.fps),rest=i===0||i===fs.length-1,v=rest?[cx,cy]:[r2(cx+rnd()*px),r2(cy+rnd()*px)];edits.push({type:'key.add',layer:cam.id,prop:'position',t},{type:'prop.set',layer:cam.id,prop:'position',t,value:v as never},{type:'key.interp',layer:cam.id,prop:'position',t,interp:'linear'});});
 return edits;
}
export const MIN_CAMERA_AMOUNT=1,MAX_CAMERA_AMOUNT=100;
/** Edits that move the camera from its rest pose at `a` to the move's end pose at `b`. `amount` is percent (zoom, pan as share of the comp size) or degrees (roll). */
export function cameraMoveEdits(c:Composition,cam:Layer,move:CameraMove,a:number,b:number,amount:number):Edit[]{
 const id=cam.id,cx=c.width/2,cy=c.height/2,r2=(n:number)=>Math.round(n*100)/100;
 const key=(p:'scale'|'position'|'rotation',v:unknown,w:unknown):Edit[]=>[{type:'key.add',layer:id,prop:p,t:a},{type:'key.add',layer:id,prop:p,t:b},{type:'prop.set',layer:id,prop:p,t:a,value:v as never},{type:'prop.set',layer:id,prop:p,t:b,value:w as never}];
 const z=100+amount,dx=c.width*amount/100,dy=c.height*amount/100;
 switch(move){
  case 'pushIn':return key('scale',[100,100],[z,z]);
  case 'pullOut':return key('scale',[z,z],[100,100]);
  case 'panLeft':return key('position',[r2(cx+dx/2),cy],[r2(cx-dx/2),cy]);
  case 'panRight':return key('position',[r2(cx-dx/2),cy],[r2(cx+dx/2),cy]);
  case 'panUp':return key('position',[cx,r2(cy+dy/2)],[cx,r2(cy-dy/2)]);
  case 'panDown':return key('position',[cx,r2(cy-dy/2)],[cx,r2(cy+dy/2)]);
  case 'rollLeft':return key('rotation',0,-amount);
  case 'rollRight':return key('rotation',0,amount);
 }
}
export const cameraSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.camera.add',title:'Add a camera for the whole scene',category:'Insert',level:'ui',keywords:['animation','camera','scene','pan','zoom','push','null','rig','parent','all layers'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0&&!findCamera(c);},
 run:(()=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(findCamera(c))return expected('This composition already has a camera.');
  const roots=c.layers.filter(l=>l.parent===null&&!l.locked);
  if(!roots.length)return expected('There are no unlocked top level layers to put under a camera.');
  const id=newId('layer'),tr=makeTransform(c.width,c.height);
  const edits:Edit[]=[{type:'layer.add',kind:'null',id,over:{name:CAMERA_NAME,transform:{...tr,anchor:prop('vec2',[c.width/2,c.height/2]),position:prop('vec2',[c.width/2,c.height/2])}}},...roots.map((l):Edit=>({type:'layer.parent',layer:l.id,parent:id}))];
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.setView({selectedLayer:id,selectedKey:null});return {id,attached:roots.length,skipped:c.layers.length-roots.length};
 }) as (p:unknown)=>unknown},{
 id:'animation.camera.move',title:'Animate the camera over the work area',category:'Edit',level:'ui',keywords:['animation','camera','move','push in','pull out','pan','roll','zoom','dolly','work area'],
 params:{type:'object',properties:{move:{enum:[...CAMERA_MOVES]},amount:{type:'integer',minimum:MIN_CAMERA_AMOUNT,maximum:MAX_CAMERA_AMOUNT}},required:['move'],additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&!!findCamera(c);},
 run:((p:{move:CameraMove;amount?:number})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const cam=findCamera(c);if(!cam)return expected('Add a camera first.');if(cam.locked)return expected('The camera is locked.');
  if(!CAMERA_MOVES.includes(p?.move))return expected('Unknown camera move.');
  const amount=p.amount??(p.move.startsWith('roll')?10:p.move.startsWith('push')||p.move.startsWith('pull')?20:15);
  if(!Number.isInteger(amount)||amount<MIN_CAMERA_AMOUNT||amount>MAX_CAMERA_AMOUNT)return expected(`The amount is ${MIN_CAMERA_AMOUNT} to ${MAX_CAMERA_AMOUNT}.`);
  const a=c.workArea.in,b=c.workArea.out;if(b<=a)return expected('The work area is empty.');
  try{s.dispatch(cameraMoveEdits(c,cam,p.move,a,b,amount));}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.setView({selectedLayer:cam.id});return {from:a,to:b,amount};
 }) as (p:unknown)=>unknown},{
 id:'animation.camera.follow',title:'Make the camera follow the selected layer',category:'Edit',level:'ui',keywords:['animation','camera','follow','track','tracking','shot','keep in frame','work area'],
 params:{type:'object',properties:{layer:{type:'string'}},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document,c=d?findComp(d):undefined,sel=s.view.selectedLayer;return !!c&&!!findCamera(c)&&!!sel&&sel!==findCamera(c)?.id&&c.layers.some(l=>l.id===sel);},
 run:((p:{layer?:string})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const cam=findCamera(c);if(!cam)return expected('Add a camera first.');if(cam.locked)return expected('The camera is locked.');
  const id=p?.layer??s.view.selectedLayer,target=c.layers.find(l=>l.id===id);if(!target)return expected('Select the layer the camera should follow.');
  if(target.id===cam.id)return expected('The camera cannot follow itself.');
  const a=c.workArea.in,b=c.workArea.out;if(b<=a)return expected('The work area is empty.');
  const edits=cameraFollowEdits(c,cam,target,a,b);
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.setView({selectedLayer:cam.id});return {target:target.id,keys:edits.filter(e=>e.type==='key.add').length};
 }) as (p:unknown)=>unknown},{
 id:'animation.camera.shake',title:'Add handheld shake to the camera',category:'Edit',level:'ui',keywords:['animation','camera','shake','handheld','earthquake','impact','jitter','work area'],
 params:{type:'object',properties:{amount:{type:'integer',minimum:1,maximum:100}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&!!findCamera(c);},
 run:((p?:{amount?:number})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const cam=findCamera(c);if(!cam)return expected('Add a camera first.');if(cam.locked)return expected('The camera is locked.');
  const px=p?.amount??8;if(!Number.isInteger(px)||px<1||px>100)return expected('The shake is 1 to 100 pixels.');
  const a=c.workArea.in,b=c.workArea.out;if(b<=a)return expected('The work area is empty.');
  const edits=cameraShakeEdits(c,cam,a,b,px);
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.setView({selectedLayer:cam.id});return {keys:edits.filter(e=>e.type==='key.add').length,amount:px};
 }) as (p:unknown)=>unknown},{
 id:'animation.camera.reset',title:'Reset the camera to rest',category:'Edit',level:'ui',keywords:['animation','camera','reset','clear','rest','keys','undo moves'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined,cam=c?findCamera(c):undefined;return !!cam&&(cam.transform.position.keys.length>0||cam.transform.scale.keys.length>0||cam.transform.rotation.keys.length>0);},
 run:(()=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const cam=findCamera(c);if(!cam)return expected('Add a camera first.');if(cam.locked)return expected('The camera is locked.');
  const T=cam.transform,edits:Edit[]=[];let n=0;
  for(const [pr,pp,rest] of [['position',T.position,[c.width/2,c.height/2]],['scale',T.scale,[100,100]],['rotation',T.rotation,0]] as const){
   if(!pp.keys.length)continue;for(const k of pp.keys){edits.push({type:'key.remove',layer:cam.id,prop:pr,t:k.t});n++;}
   edits.push({type:'prop.set',layer:cam.id,prop:pr,t:c.workArea.in,value:rest as never});}
  if(!edits.length)return expected('The camera has no keys to clear.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.setView({selectedLayer:cam.id});return {removed:n};
 }) as (p:unknown)=>unknown}];
