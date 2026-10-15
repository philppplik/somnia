import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Composition,type Layer,type Vec2} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {worldMatrix,parentMatrix,invertMatrix} from './scene';
import {evaluateMod} from './modifiers';
import {frameToTick,tickToFrame} from './time';
import {flattenRing} from './pathBoolean';
/** Travel layers along the path of the first ticked path shape layer: position keys (and optionally rotation keys that face the way of travel) over the work area. Baked keys, not a live constraint. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_PATH_KEYS=120,MAX_PATH_LAYERS=20;
const isAncestor=(c:Composition,anc:string,l:Layer):boolean=>{const seen=new Set<string>();let cur=l.parent?findLayer(c,l.parent):undefined;while(cur&&!seen.has(cur.id)){if(cur.id===anc)return true;seen.add(cur.id);cur=cur.parent?findLayer(c,cur.parent):undefined;}return false;};
export const isPathLayer=(l:Layer):boolean=>l.kind==='shape'&&l.source.shape==='path'&&!!l.source.path&&l.source.path.points.length>=2;
/** Point and direction (radians) at fraction `u` 0..1 of the polyline's length. */
export function polylineAt(pts:readonly Vec2[],u:number):{p:Vec2;angle:number}{
 const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
 const total=cum[cum.length-1],d=Math.min(1,Math.max(0,u))*total;let i=1;while(i<pts.length-1&&cum[i]<d)i++;
 const seg=cum[i]-cum[i-1]||1,k=Math.min(1,Math.max(0,(d-cum[i-1])/seg)),a=pts[i-1],b=pts[i];
 return {p:[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k],angle:Math.atan2(b[1]-a[1],b[0]-a[0])};
}
/** The path in world space at the work-area start (closed paths return to their first point). */
export function worldPolyline(c:Composition,path:Layer,t:number):Vec2[]{
 const src=path.source,w=Math.max(1,src.width??1),h=Math.max(1,src.height??1),m=worldMatrix(c,path,t);
 const pts=flattenRing(src.path as never,w,h) as unknown as Vec2[];if(src.path!.closed)pts.push(pts[0]);
 return pts.map(q=>[m[0]*q[0]+m[2]*q[1]+m[4],m[1]*q[0]+m[3]*q[1]+m[5]] as Vec2);
}
export function pathKeys(c:Composition,l:Layer,path:Layer,a:number,b:number,orient:boolean):{t:number;v:Vec2;r?:number}[]|null{
 const f0=tickToFrame(a,c.fps),f1=tickToFrame(b,c.fps),step=Math.max(1,Math.ceil((f1-f0)/(MAX_PATH_KEYS-1)));
 const fs:number[]=[];for(let f=f0;f<f1;f+=step)fs.push(f);fs.push(f1);
 const poly=worldPolyline(c,path,a);let prev=evaluateMod(l.transform.rotation,a) as number;const out:{t:number;v:Vec2;r?:number}[]=[];
 for(const f of fs){const t=frameToTick(f,c.fps),pm=parentMatrix(c,l,t),inv=invertMatrix(pm);if(!inv)return null;
  const {p,angle}=polylineAt(poly,(f-f0)/Math.max(1,f1-f0)),k:{t:number;v:Vec2;r?:number}={t,v:[Math.round((inv[0]*p[0]+inv[2]*p[1]+inv[4])*100)/100,Math.round((inv[1]*p[0]+inv[3]*p[1]+inv[5])*100)/100]};
  if(orient){let v=angle*180/Math.PI-Math.atan2(pm[1],pm[0])*180/Math.PI;v+=360*Math.round((prev-v)/360);prev=v;k.r=Math.round(v*100)/100;}
  out.push(k);}
 return out;
}
export const pathFollowSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.followPath',title:'Travel layers along the first ticked path layer',category:'Edit',level:'ui',keywords:['animation','path','motion path','travel','follow','move along','route','orient','car','train'],
 params:{type:'object',properties:{orient:{type:'boolean'},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:2,maxItems:MAX_PATH_LAYERS+1}},additionalProperties:false},
 // The Rig menu passes its own ticked layers: the first is the path, the others travel along it.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.some(isPathLayer)&&c.layers.length>1;},
 run:((p:{orient?:boolean;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_PATH_LAYERS+1).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l);
  if(ids.length<2)return expected('Tick the path layer first, then the layers that should travel along it.');
  const path=ids[0];if(!isPathLayer(path))return expected('The first ticked layer must be a path shape with at least two points.');
  const movers=ids.slice(1).filter(l=>!l.locked&&l.kind!=='audio'&&l.id!==path.id);
  if(!movers.length)return expected('The layers that should travel are locked.');
  if(movers.some(l=>isAncestor(c,l.id,path)))return expected('The path hangs from a layer that should travel along it.');
  const a=c.workArea.in,b=c.workArea.out;if(b<=a)return expected('The work area is empty.');
  const orient=p.orient===true,edits:Edit[]=[];let skipped=0;
  for(const l of movers){
   const keys=pathKeys(c,l,path,a,b,orient);if(!keys){skipped++;continue;}
   for(const k of l.transform.position.keys)edits.push({type:'key.remove',layer:l.id,prop:'position',t:k.t});
   if(orient)for(const k of l.transform.rotation.keys)edits.push({type:'key.remove',layer:l.id,prop:'rotation',t:k.t});
   for(const k of keys){edits.push({type:'key.add',layer:l.id,prop:'position',t:k.t},{type:'prop.set',layer:l.id,prop:'position',t:k.t,value:k.v as never},{type:'key.interp',layer:l.id,prop:'position',t:k.t,interp:'linear'});
    if(k.r!==undefined)edits.push({type:'key.add',layer:l.id,prop:'rotation',t:k.t},{type:'prop.set',layer:l.id,prop:'rotation',t:k.t,value:k.r as never},{type:'key.interp',layer:l.id,prop:'rotation',t:k.t,interp:'linear'});}}
  if(!edits.length)return expected('The layers could not be moved onto the path.');
  try{s.dispatch(edits);}catch(err){if(err instanceof EditError)throw Object.assign(err,{expected:true});throw err;}
  return {travelling:movers.length-skipped,skipped,oriented:orient,keys:edits.filter(x=>x.type==='key.add').length};
 }) as (p:unknown)=>unknown}];
