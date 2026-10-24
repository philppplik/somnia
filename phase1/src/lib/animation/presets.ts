import {evaluate} from './interpolate';
import {findComp,findLayer,type AnimationDocument,type Property,type PropValue,type TransformKey,type Vec2} from './model';
import {frameToTick,snapToFrame,TICKS_PER_SECOND} from './time';
import type {Edit} from './edit';
export type MotionPreset='fade'|'slide'|'bounce'|'typewriter'|'trim'|'dash';
const property=(values:readonly {t:number;v:PropValue}[],type:'scalar'|'vec2'):Property=>({type,value:values[0].v,keys:values.map(k=>({...k,interp:'linear',out:[0.33,0],in:[0.67,1]}))});
/** Original bounded entrance presets. Never overwrite existing animation: caller gets an explicit failure. */
export function presetEdits(doc:AnimationDocument,layerId:string,preset:MotionPreset,at:number,seconds=1):Edit[]{
 const c=findComp(doc),l=c&&findLayer(c,layerId);if(!c||!l)throw Error('Select a layer.');if(l.locked)throw Error('Layer is locked.');
 if(!Number.isFinite(seconds)||seconds<0.1||seconds>30)throw Error('Preset duration must be 0.1–30 seconds.');
 const start=snapToFrame(at,c.fps),end=snapToFrame(start+seconds*TICKS_PER_SECOND,c.fps);
 if(start<c.start||end>c.duration+c.start||end<=start)throw Error('Preset does not fit the composition.');
 if(preset==='trim'||preset==='dash'){if(l.kind!=='shape')throw Error('Stroke presets require a shape.');if(l.stroke?.[preset]?.keys.length)throw Error('Stroke property already has keys.');return [{type:'layer.stroke',layer:l.id,stroke:{color:l.stroke?.color??'#ffffff',width:l.stroke?.width??6,...l.stroke,[preset]:property([{t:start,v:preset==='trim'?0:100},{t:end,v:preset==='trim'?100:0}],'scalar')}}];}
 if(preset==='typewriter'){if(l.kind!=='text')throw Error('Typewriter requires text.');if(l.textReveal?.keys.length)throw Error('Text already has a reveal animation.');return [{type:'layer.reveal',layer:l.id,property:property([{t:start,v:0},{t:end,v:100}],'scalar')}];}
 const prop:TransformKey=preset==='fade'?'opacity':'position';if(l.transform[prop].keys.length)throw Error('Property already has keys. Undo/remove them before applying a preset.');
 const target=evaluate(l.transform[prop],start);const samples:{t:number;v:PropValue}[]=[];
 if(preset==='fade')samples.push({t:start,v:0},{t:end,v:target});
 else {const v=target as Vec2;const distance=Math.min(300,c.height/3);if(preset==='slide')samples.push({t:start,v:[v[0]-distance,v[1]]},{t:end,v});
  else {const frames=Math.max(1,Math.round((end-start)*c.fps.num/(c.fps.den*TICKS_PER_SECOND)));const count=Math.min(60,frames);
   for(let i=0;i<=count;i++){const u=i/count;const displacement=i===count?0:distance*Math.exp(-6*u)*Math.cos(3*Math.PI*u);samples.push({t:frameToTick(Math.round(start*c.fps.num/(c.fps.den*TICKS_PER_SECOND))+Math.round(frames*u),c.fps),v:[v[0],v[1]-displacement]});}}
 }
 return [{type:'prop.animate',layer:l.id,prop,on:true,t:start},...samples.flatMap(k=>[{type:'prop.set',layer:l.id,prop,value:k.v,t:k.t},{type:'key.interp',layer:l.id,prop,t:k.t,interp:'linear'}] as Edit[])];
}
