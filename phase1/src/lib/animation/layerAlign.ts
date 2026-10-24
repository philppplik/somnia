import type {Composition} from './model';
import type {Edit} from './edit';
import {worldMatrix,applyMatrix} from './scene';
import {toParentDelta} from './snap';
import {evaluate} from './interpolate';
/** Align or distribute the anchor points (where each layer's position puts it) of several layers, in composition space at one time. */
export const ALIGN_MODES=['left','centerX','right','top','centerY','bottom','distributeX','distributeY'] as const;
export type AlignMode=typeof ALIGN_MODES[number];
export const MAX_ALIGN_LAYERS=50;
const round=(n:number)=>Math.round(n*100)/100;
export interface AlignPlan{edits:Edit[];moved:number;skipped:number}
/** Target world coordinate per layer for the mode, keyed by layer id; null when the mode needs more layers. */
export function alignTargets(pts:readonly {id:string;v:number}[],mode:AlignMode):Map<string,number>|null{
 const out=new Map<string,number>();if(!pts.length)return out;
 const vs=pts.map(p=>p.v),lo=Math.min(...vs),hi=Math.max(...vs);
 if(mode==='left'||mode==='top'){pts.forEach(p=>out.set(p.id,lo));return out;}
 if(mode==='right'||mode==='bottom'){pts.forEach(p=>out.set(p.id,hi));return out;}
 if(mode==='centerX'||mode==='centerY'){pts.forEach(p=>out.set(p.id,(lo+hi)/2));return out;}
 if(pts.length<3)return null;
 const sorted=[...pts].sort((a,b)=>a.v-b.v);sorted.forEach((p,i)=>out.set(p.id,lo+(hi-lo)*i/(sorted.length-1)));return out;
}
export function alignPlan(c:Composition,ids:readonly string[],mode:AlignMode,t:number):AlignPlan{
 const want=new Set(ids);let skipped=0;
 const ls=c.layers.filter(l=>want.has(l.id)).slice(0,MAX_ALIGN_LAYERS).filter(l=>{const ok=!l.locked&&l.kind!=='audio';if(!ok)skipped++;return ok;});
 const axis=mode==='top'||mode==='centerY'||mode==='bottom'||mode==='distributeY'?1:0;
 const pos=ls.map(l=>({l,w:applyMatrix(worldMatrix(c,l,t),evaluate(l.transform.anchor,t) as [number,number])}));
 const targets=alignTargets(pos.map(p=>({id:p.l.id,v:p.w[axis]})),mode);
 if(!targets)return {edits:[],moved:0,skipped};
 const edits:Edit[]=[];
 for(const p of pos){
  const d:[number,number]=[0,0];d[axis]=targets.get(p.l.id)!-p.w[axis];
  if(Math.abs(d[axis])<0.005)continue;
  const pd=toParentDelta(c,p.l,t,d),cur=evaluate(p.l.transform.position,t) as readonly number[];
  edits.push({type:'prop.set',layer:p.l.id,prop:'position',t,value:[round(cur[0]+pd[0]),round(cur[1]+pd[1])]});
 }
 return {edits,moved:edits.length,skipped};
}
