import type {Composition,InterfaceAsset} from './model';
import type {ExportSettings} from './exportSettings';
import {preflight,type Box,type PreflightIssue} from './exportPreflight';
import {worldMatrix,applyMatrix} from './scene';
import {workAreaTicks} from './exportCropCommands';
/** Check the composition against the current export settings (range and crop). */
export function exportCheck(comp:Composition,assets:readonly InterfaceAsset[],s:ExportSettings,range?:{in:number;out:number}):PreflightIssue[]{
 const r=range??comp.workArea,ticks=workAreaTicks({...comp,workArea:r});
 return preflight({layers:comp.layers,assetIds:new Set(assets.map(a=>a.id)),range:r,frame:s.crop??{x:0,y:0,width:comp.width,height:comp.height},
  boxes:l=>{const w=l.source.width,h=l.source.height;if(!(w&&h&&w>0&&h>0))return [];
   return ticks.map<Box>(t=>{const m=worldMatrix(comp,l,t),ps=([[0,0],[w,0],[0,h],[w,h]] as const).map(q=>applyMatrix(m,[q[0],q[1]]));return {x0:Math.min(...ps.map(p=>p[0])),y0:Math.min(...ps.map(p=>p[1])),x1:Math.max(...ps.map(p=>p[0])),y1:Math.max(...ps.map(p=>p[1]))};});}});
}
