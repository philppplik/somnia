import type {PhotoSettings} from './studioSettings';
import {exportDimensions} from '../export/dimensions';
import {injectPngMetadata,injectJpegMetadata,hasExportMetadata} from '../export/metadata';
import {photoExportMetadata,type PhotoAdvancedOptions} from './photosExportSchema';
/** Renders the developed photo through the AE1 option pipeline. Browser-only: canvas, bitmap and encoders. */
export interface AdvancedRenderResult{blob:Blob;bytes:number;width:number;height:number;note:string|null}
export interface PhotoEngineLike{exportPhoto(settings:PhotoSettings,format:'png'|'jpeg'):Promise<{bytes?:Uint8Array}>}
let p3Supported:boolean|null=null;
function supportsDisplayP3():boolean{
 if(p3Supported!==null)return p3Supported;
 try{const c=document.createElement('canvas');p3Supported=!!c.getContext('2d',{colorSpace:'display-p3'});}catch{p3Supported=false;}
 return p3Supported;
}
export async function renderAdvancedPhotoExport(engine:PhotoEngineLike,snapshot:PhotoSettings,options:PhotoAdvancedOptions):Promise<AdvancedRenderResult>{
 const r=await engine.exportPhoto(snapshot,'png');
 if(!r.bytes)throw Error('Export returned no bytes.');
 const bitmap=await createImageBitmap(new Blob([r.bytes],{type:'image/png'}));
 try{
  const dims=exportDimensions({sourceWidth:bitmap.width,sourceHeight:bitmap.height,mode:options.mode,percent:options.scalePercent,width:options.width,height:options.height,lockAspect:options.lockAspect});
  const wantP3=options.profile==='display-p3'&&supportsDisplayP3();
  const canvas=document.createElement('canvas');canvas.width=dims.width;canvas.height=dims.height;
  const ctx=canvas.getContext('2d',wantP3?{colorSpace:'display-p3'}:undefined);
  if(!ctx)throw Error('No 2D canvas.');
  if(options.profile==='grayscale')ctx.filter='saturate(0)';
  ctx.drawImage(bitmap,0,0,dims.width,dims.height);
  const mime=options.format==='png'?'image/png':options.format==='webp'?'image/webp':'image/jpeg';
  const blob=await new Promise<Blob>((res,rej)=>canvas.toBlob(b=>b?res(b):rej(Error('Could not encode the export.')),mime,options.format==='png'?undefined:options.quality/100));
  let bytes=new Uint8Array(await blob.arrayBuffer());
  const meta=photoExportMetadata(options);
  if(hasExportMetadata(meta)){
   if(options.format==='png')bytes=injectPngMetadata(bytes,meta);
   else if(options.format==='jpeg')bytes=injectJpegMetadata(bytes,meta);
  }
  const note=options.profile==='display-p3'&&!wantP3?'export.note.p3':options.format==='webp'&&hasExportMetadata(meta)?'export.note.webpMeta':null;
  return{blob:new Blob([bytes],{type:mime}),bytes:bytes.length,width:dims.width,height:dims.height,note};
 }finally{bitmap.close();}
}
