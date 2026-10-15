import type {Composition,InterfaceAsset} from './model';
import type {ExportSettings} from './exportSettings';
import {preflight,type Box,type PreflightIssue} from './exportPreflight';
import {worldMatrix,applyMatrix} from './scene';
import {evaluateMod} from './modifiers';
import {workAreaTicks} from './exportCropCommands';
import {snapToFrame,frameToTick} from './time';
const MAX_FLASH_FRAMES=3600;
/** Check the composition against the current export settings (range and crop). */
export function exportCheck(comp:Composition,assets:readonly InterfaceAsset[],s:ExportSettings,range?:{in:number;out:number}):PreflightIssue[]{
 const r=range??comp.workArea,ticks=workAreaTicks({...comp,workArea:r});
 return preflight({layers:comp.layers,assetIds:new Set(assets.map(a=>a.id)),range:r,frame:s.crop??{x:0,y:0,width:comp.width,height:comp.height},
  seamless:s.loopSeam===true,oneFrame:frameToTick(1,comp.fps),
  frames:l=>{const a=snapToFrame(r.in,comp.fps),one=frameToTick(1,comp.fps),n=Math.min(MAX_FLASH_FRAMES,Math.max(0,Math.floor((r.out-a)/one)));return {opacity:Array.from({length:n},(_,i)=>evaluateMod(l.transform.opacity,a+i*one) as number),perSecond:comp.fps.num/comp.fps.den};},
  scales:l=>ticks.map(t=>Math.min(...(evaluateMod(l.transform.scale,t) as number[]).map(Math.abs))),
  textPx:l=>l.kind==='text'?ticks.map(t=>{const m=worldMatrix(comp,l,t);return (l.source.size??48)*Math.hypot(m[0],m[1])*s.scale/100;}):[],
  look:l=>{const T=l.transform,at=(t:number)=>[...(evaluateMod(T.position,t) as number[]),...(evaluateMod(T.scale,t) as number[]),evaluateMod(T.rotation,t) as number,evaluateMod(T.opacity,t) as number];
   return {opacity:ticks.map(t=>evaluateMod(T.opacity,t) as number),first:at(ticks[0]),last:at(ticks[ticks.length-1])};},
  boxes:l=>{const w=l.source.width,h=l.source.height;if(!(w&&h&&w>0&&h>0))return [];
   return ticks.map<Box>(t=>{const m=worldMatrix(comp,l,t),ps=([[0,0],[w,0],[0,h],[w,h]] as const).map(q=>applyMatrix(m,[q[0],q[1]]));return {x0:Math.min(...ps.map(p=>p[0])),y0:Math.min(...ps.map(p=>p[1])),x1:Math.max(...ps.map(p=>p[0])),y1:Math.max(...ps.map(p=>p[1]))};});}});
}
