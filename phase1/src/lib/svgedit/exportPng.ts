import * as C from './controller';
import {svgToPng} from './raster';
import {patchUi} from './store';
export async function exportPng(scale:number,background:string|null):Promise<boolean>{
 try{const d=C.docBox();const blob=await svgToPng(C.sourceText(),{w:d.w,h:d.h},{scale,background});
  const name=(C.file().split('/').pop()||'drawing').replace(/\.svg$/i,'')+(scale!==1?`@${scale}x`:'')+'.png';
  const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
  patchUi({notice:''});return true;
 }catch(e){patchUi({notice:`PNG export failed: ${e instanceof Error?e.message:String(e)}`});return false;}}
