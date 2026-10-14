import type {Rational} from './time';
import type {Composition,Layer} from './model';
import {frameToTick,tickToFrame} from './time';
/** Onion skin (viewer only, never exported): faint copies of the composition at nearby frames. Pure and bounded. */
export interface Onion{on:boolean;before:number;after:number;step:number;/** Ghost only the selected layer (with its parents and matte source). */selectedOnly:boolean;/** Ghost opacity of the nearest frame, percent. */opacity:number;/** Cool and warm tint for earlier and later frames. */tint:boolean}
export const MAX_GHOSTS=5,MAX_STEP=30,MIN_OPACITY=10,MAX_OPACITY=80;
export const defaultOnion=():Onion=>({on:false,before:2,after:1,step:1,selectedOnly:false,opacity:40,tint:true});
const clampInt=(x:unknown,lo:number,hi:number,d:number)=>typeof x==='number'&&Number.isFinite(x)?Math.min(hi,Math.max(lo,Math.round(x))):d;
export const normalizeOnion=(x:unknown):Onion=>{const d=defaultOnion(),o=(x&&typeof x==='object'?x:{}) as Partial<Onion>;return {on:o.on===true,before:clampInt(o.before,0,MAX_GHOSTS,d.before),after:clampInt(o.after,0,MAX_GHOSTS,d.after),step:clampInt(o.step,1,MAX_STEP,d.step),selectedOnly:o.selectedOnly===true,opacity:clampInt(o.opacity,MIN_OPACITY,MAX_OPACITY,d.opacity),tint:o.tint!==false};};
export interface Ghost{tick:number;side:'before'|'after';n:number;opacity:number}
/** Ghost frames around the playhead, nearest first per side. Ticks outside 0..duration are skipped; the current frame is never repeated. */
export function ghostFrames(o:Onion,playhead:number,fps:Rational,duration:number):Ghost[]{
 if(!o.on)return [];
 const f=tickToFrame(playhead,fps),out:Ghost[]=[];
 for(const [side,count,sign] of [['before',o.before,-1],['after',o.after,1]] as const)
  for(let n=1;n<=count;n++){const tick=frameToTick(f+sign*n*o.step,fps);if(tick<0||tick>=duration)continue;out.push({tick,side,n,opacity:Math.round(o.opacity/n)/100});}
 return out;
}
/** The composition reduced to one layer: its parent chain (hidden, for the transforms) and its matte source. Unknown ids give the composition unchanged. */
export function layerOnlyComp(comp:Composition,id:string|null):Composition{
 const by=new Map(comp.layers.map(l=>[l.id,l] as const)),sel=id?by.get(id):undefined;
 if(!sel)return comp;
 const keep=new Set<string>([sel.id]),hidden=new Set<string>();
 for(let p=sel.parent,i=0;p&&by.has(p)&&i<64&&!keep.has(p);p=by.get(p)!.parent,i++){keep.add(p);hidden.add(p);}
 if(sel.matte&&by.has(sel.matte.source)){keep.add(sel.matte.source);}
 return {...comp,layers:comp.layers.filter(l=>keep.has(l.id)).map((l):Layer=>hidden.has(l.id)?{...l,visible:false,solo:false}:l)};
}
