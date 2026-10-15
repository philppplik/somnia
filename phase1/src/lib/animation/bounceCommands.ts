import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Composition,type Layer,type Vec2} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {worldMatrix,parentMatrix,invertMatrix} from './scene';
import {evaluateMod} from './modifiers';
import {frameToTick,tickToFrame} from './time';
/** Drop layers onto the first ticked layer and let them bounce: position keys over the work area along gravity arcs that lose height each bounce. Baked keys. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_BOUNCE_KEYS=120,MAX_BOUNCE_LAYERS=20,MAX_BOUNCES=10,DEFAULT_RESTITUTION=60;
const anchorWorld=(c:Composition,l:Layer,t:number):Vec2=>{const m=worldMatrix(c,l,t),a=evaluateMod(l.transform.anchor,t) as Vec2;return [m[0]*a[0]+m[2]*a[1]+m[4],m[1]*a[0]+m[3]*a[1]+m[5]];};
const isAncestor=(c:Composition,anc:string,l:Layer):boolean=>{const seen=new Set<string>();let cur=l.parent?findLayer(c,l.parent):undefined;while(cur&&!seen.has(cur.id)){if(cur.id===anc)return true;seen.add(cur.id);cur=cur.parent?findLayer(c,cur.parent):undefined;}return false;};
/** Height above the floor (0..h0 as a fraction 0..1) at progress `u` of the whole motion: one fall, then `n` bounces whose heights shrink by restitution squared. */
export function bounceHeight(u:number,n:number,restitution:number):number{
 const e=restitution/100,d=[1];for(let k=1;k<=n;k++)d.push(d[k-1]*e);
 const total=d[0]+2*d.slice(1).reduce((s,x)=>s+x,0);let tau=Math.min(1,Math.max(0,u))*total;
 if(tau<=d[0])return 1-(tau/d[0])**2;tau-=d[0];
 for(let k=1;k<=n;k++){const len=2*d[k];if(tau<=len||k===n){const x=Math.min(1,tau/len)*2-1;return d[k]**2*(1-x*x);}tau-=len;}
 return 0;
}
/** Position keys for `l` falling onto `ground` and bouncing `n` times. Null when the layer is not above the ground or its parent cannot be inverted. */
export function bounceKeys(c:Composition,l:Layer,ground:Layer,a:number,b:number,n:number,restitution:number):{t:number;v:Vec2}[]|null{
 const f0=tickToFrame(a,c.fps),f1=tickToFrame(b,c.fps),step=Math.max(1,Math.ceil((f1-f0)/(MAX_BOUNCE_KEYS-1)));
 const fs:number[]=[];for(let f=f0;f<f1;f+=step)fs.push(f);fs.push(f1);
 const p0=anchorWorld(c,l,a),yf=anchorWorld(c,ground,a)[1],h0=yf-p0[1];if(h0<1)return null;
 const out:{t:number;v:Vec2}[]=[];
 for(const f of fs){const t=frameToTick(f,c.fps),inv=invertMatrix(parentMatrix(c,l,t));if(!inv)return null;
  const y=yf-bounceHeight((f-f0)/Math.max(1,f1-f0),n,restitution)*h0,x=p0[0];
  out.push({t,v:[Math.round((inv[0]*x+inv[2]*y+inv[4])*100)/100,Math.round((inv[1]*x+inv[3]*y+inv[5])*100)/100]});}
 return out;
}
export const bounceSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.bounce',title:'Drop layers onto the first ticked layer and bounce',category:'Edit',level:'ui',keywords:['animation','bounce','drop','fall','gravity','ball','physics','floor','ground'],
 params:{type:'object',properties:{bounces:{type:'integer',minimum:1,maximum:MAX_BOUNCES},restitution:{type:'integer',minimum:10,maximum:90},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:2,maxItems:MAX_BOUNCE_LAYERS+1}},additionalProperties:false},
 // The Rig menu passes its own ticked layers: the first is the ground, the others drop onto it.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>1;},
 run:((p:{bounces?:number;restitution?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const n=p.bounces??3,e=p.restitution??DEFAULT_RESTITUTION;
  if(!Number.isInteger(n)||n<1||n>MAX_BOUNCES)return expected(`Bounces are 1 to ${MAX_BOUNCES}.`);
  if(!Number.isInteger(e)||e<10||e>90)return expected('Bounciness is 10 to 90 percent.');
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_BOUNCE_LAYERS+1).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l);
  if(ids.length<2)return expected('Tick the ground first, then the layers that should drop onto it.');
  const ground=ids[0],balls=ids.slice(1).filter(l=>!l.locked&&l.kind!=='audio');
  if(!balls.length)return expected('The layers that should drop are locked.');
  if(balls.some(l=>isAncestor(c,l.id,ground)))return expected('The ground hangs from a layer that should drop onto it.');
  const a=c.workArea.in,b=c.workArea.out;if(b<=a)return expected('The work area is empty.');
  const edits:Edit[]=[];let skipped=0;
  for(const l of balls){
   const keys=bounceKeys(c,l,ground,a,b,n,e);if(!keys){skipped++;continue;}
   for(const k of l.transform.position.keys)edits.push({type:'key.remove',layer:l.id,prop:'position',t:k.t});
   for(const k of keys)edits.push({type:'key.add',layer:l.id,prop:'position',t:k.t},{type:'prop.set',layer:l.id,prop:'position',t:k.t,value:k.v as never},{type:'key.interp',layer:l.id,prop:'position',t:k.t,interp:'linear'});}
  if(!edits.length)return expected('Put the layers above the ground first. They fall from where they are now.');
  try{s.dispatch(edits);}catch(err){if(err instanceof EditError)throw Object.assign(err,{expected:true});throw err;}
  return {dropping:balls.length-skipped,skipped,bounces:n,keys:edits.filter(x=>x.type==='key.add').length};
 }) as (p:unknown)=>unknown}];
