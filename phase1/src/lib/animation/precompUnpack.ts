import type {Composition,Layer,Property} from './model';
import {layerKeyTimes,shiftLayerKeys} from './layerShift';
/**
 * Unpacking a precomposition layer: its child layers are copied into the parent composition, timed to where the precomp layer plays them,
 * and the roots hang from a null that takes over the precomp layer's transform. Pure; only clean precomps unpack (no effects, masks, matte,
 * opacity, repeater, speed, loop or audio on the precomp layer, no audio inside) so the picture stays the same. The child composition is left alone.
 */
export const MAX_UNPACK_LAYERS=49;
export interface Unpacked{layers:Layer[];dropped:number}
const hasKeys=(p:Property)=>p.keys.length>0;
/** Why this precomp layer cannot be unpacked, or null. */
export function unpackBlocker(parent:Composition,pl:Layer,child:Composition|undefined):string|null{
 if(pl.kind!=='comp')return 'That is not a precomposition layer.';
 if(!child)return 'The precomposition no longer exists.';
 if(pl.locked)return 'The layer is locked.';
 const s=pl.source;
 if((s.speed!==undefined&&s.speed!==100)||s.timeOffset||s.loop)return 'The precomposition layer has speed, time offset or loop set.';
 if((s.width!==undefined&&s.width!==child.width)||(s.height!==undefined&&s.height!==child.height))return 'The precomposition layer is scaled to another size.';
 if(pl.effects?.length||pl.masks?.length||pl.matte||pl.repeater||pl.motionBlur||pl.colorKeys||pl.gain||pl.solo)return 'The precomposition layer has effects, masks, a matte, a repeater, motion blur, colour keys, volume or solo.';
 if(hasKeys(pl.transform.opacity)||pl.transform.opacity.value!==100||pl.transform.opacity.modifiers?.length)return 'The precomposition layer has an opacity setting.';
 if(s.volume!==undefined&&s.volume!==100)return 'The precomposition layer has a volume setting.';
 if(child.layers.length===0)return 'The precomposition is empty.';
 if(child.layers.length>MAX_UNPACK_LAYERS)return `The precomposition has more than ${MAX_UNPACK_LAYERS} layers.`;
 if(child.layers.some(l=>l.kind==='audio'))return 'The precomposition contains audio.';
 if(child.id===parent.id)return 'A composition cannot unpack itself.';
 return null;
}
/** The unpacked layers (child layers first in stacking order, the group null last) or an error text. `ids` maps child layer ids that already exist in the parent to fresh ids. */
export function unpackLayers(parent:Composition,pl:Layer,child:Composition,nullId:string,ids:ReadonlyMap<string,string>):Unpacked|string{
 const why=unpackBlocker(parent,pl,child);if(why)return why;
 const plStart=pl.inT+pl.offset,plEnd=pl.outT+pl.offset,delta=plStart-child.start,end=Math.min(plEnd,plStart+child.duration);
 const lo=parent.start,hi=parent.start+parent.duration;
 const remap=(id:string)=>ids.get(id)??id;
 const needed=new Set<string>();for(const l of child.layers){if(l.parent)needed.add(l.parent);if(l.matte)needed.add(l.matte.source);}
 const out:Layer[]=[];let dropped=0;
 for(const l of child.layers){
  const s=l.inT+l.offset+delta,e=l.outT+l.offset+delta;let ns=Math.max(s,plStart),ne=Math.min(e,end);
  if(ne<=ns){if(!needed.has(l.id)){dropped++;continue;}ns=plStart;ne=plStart+1;}
  const c=JSON.parse(JSON.stringify(shiftLayerKeys(l,delta))) as Layer;
  c.id=remap(l.id);c.inT=ns;c.outT=ne;c.offset=0;c.parent=l.parent?remap(l.parent):nullId;
  if(c.matte)c.matte={...c.matte,source:remap(c.matte.source)};
  const tr=c.transform as unknown as Record<string,Property>;
  for(const k of Object.keys(tr)){const ms=tr[k].modifiers;if(ms)tr[k]={...tr[k],modifiers:ms.map(m=>m.type==='link'?{...m,layer:remap(m.layer)}:m)};}
  if(!pl.visible)c.visible=false;
  if(ne>parent.duration||ns<0||layerKeyTimes(c).some(t=>t<lo||t>hi))return `"${l.name}" would not fit the length of this composition.`;
  out.push(c);
 }
 if(!out.length)return 'Nothing of the precomposition is visible in the time this layer plays it.';
 const group:Layer={...JSON.parse(JSON.stringify(pl)) as Layer,id:nullId,kind:'null',source:{},name:pl.name};
 delete (group as {gain?:unknown}).gain;
 return {layers:[...out,group],dropped};
}
