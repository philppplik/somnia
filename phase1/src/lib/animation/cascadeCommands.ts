import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Layer,type Vec2} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {worldMatrix} from './scene';
import {evaluateMod} from './modifiers';
import {frameToTick} from './time';
/** Cascade: slide whole layers (in, out and keys) in time by where they sit on the canvas, so a grid of icons ripples in from one side or from the middle. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const CASCADE_DIRS=['right','left','down','up','out','in','random'] as const;
export type CascadeDir=typeof CASCADE_DIRS[number];
export const MAX_CASCADE_LAYERS=60,MAX_CASCADE_FRAMES=240;
/** Delay in ticks (0..spread) for each point. Right: left edge first. Out: nearest the centre first. In: farthest first. */
const rng=(seed:number)=>{let a=(seed>>>0)||1;return()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};};
export function cascadeDelays(pts:readonly Vec2[],dir:CascadeDir,spread:number,seed=1):number[]|null{
 if(dir==='random'){if(pts.length<2)return null;const r=rng(seed),k=pts.map(()=>r());const lo=Math.min(...k),hi=Math.max(...k);return k.map(x=>Math.round((x-lo)/(hi-lo||1)*spread));}
 const cx=pts.reduce((a,p)=>a+p[0],0)/pts.length,cy=pts.reduce((a,p)=>a+p[1],0)/pts.length;
 const k=pts.map(p=>dir==='right'?p[0]:dir==='left'?-p[0]:dir==='down'?p[1]:dir==='up'?-p[1]:(dir==='out'?1:-1)*Math.hypot(p[0]-cx,p[1]-cy));
 const lo=Math.min(...k),hi=Math.max(...k);if(hi-lo<1e-6)return null;
 return k.map(x=>Math.round((x-lo)/(hi-lo)*spread));
}
export const cascadeSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.cascade',title:'Delay the ticked layers by their position on the canvas',category:'Edit',level:'ui',keywords:['animation','cascade','ripple','stagger','position','grid','wave','delay','order','left','right','centre','outward'],
 params:{type:'object',properties:{dir:{type:'string',enum:[...CASCADE_DIRS]},frames:{type:'integer',minimum:1,maximum:MAX_CASCADE_FRAMES},seed:{type:'integer',minimum:0,maximum:99999},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:2,maxItems:MAX_CASCADE_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>1;},
 run:((p:{dir?:string;frames?:number;seed?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const dir=(p.dir??'right') as CascadeDir,frames=p.frames??12;
  if(!CASCADE_DIRS.includes(dir))return expected('Cascade right, left, down, up, out, in or random.');
  if(!Number.isInteger(frames)||frames<1||frames>MAX_CASCADE_FRAMES)return expected(`The spread is 1 to ${MAX_CASCADE_FRAMES} frames.`);
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_CASCADE_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked);
  if(ls.length<2)return expected('Tick at least two unlocked layers.');
  const pts=ls.map(l=>{const m=worldMatrix(c,l,l.inT),a=evaluateMod(l.transform.anchor,l.inT) as Vec2;return [m[0]*a[0]+m[2]*a[1]+m[4],m[1]*a[0]+m[3]*a[1]+m[5]] as Vec2;});
  const seed=p.seed??1;if(!Number.isInteger(seed)||seed<0||seed>99999)return expected('The seed is a whole number from 0 to 99999.');
  const dl=cascadeDelays(pts,dir,frameToTick(frames,c.fps),seed);if(!dl)return expected('The ticked layers sit at the same spot, so there is no order to follow.');
  const edits:Edit[]=[];let trimmed=0;
  ls.forEach((l,i)=>{if(!dl[i])return;if(l.outT+dl[i]>c.duration){edits.push({type:'layer.timing' as const,layer:l.id,inT:l.inT,outT:c.duration-dl[i]});trimmed++;}edits.push({type:'layer.shift' as const,layer:l.id,delta:dl[i],mode:'slide' as const});});
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:ls.length,dir,frames,trimmed};
 }) as (p:unknown)=>unknown}];
