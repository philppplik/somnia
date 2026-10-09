import {decodeRasterPreview} from '../rasterPreview';
import {FORMATS,sniffBinary,type FormatId} from './formats';
import type {Rasterizer} from './engine';
const MAX_PIXELS=16_000_000;const MAX_SIDE=16_384;
/** Browser rasterizer: decodes with the platform image decoder, redraws on a canvas, encodes. JPEG gets a white background (no alpha). */
export const canvasRasterizer:Rasterizer=async(bytes,from,to,quality)=>{
 const src=FORMATS[from as Exclude<FormatId,'unknown'>];
 const original=new Blob([bytes as Uint8Array<ArrayBuffer>],{type:src.mime});
 const blob=['gif','bmp','ico','tga','tiff','qoi','pnm','avif'].includes(from)?(await decodeRasterPreview(original,`image.${src.ext}`,src.mime)).blob:original;
 const url=URL.createObjectURL(blob);
 try{
  const img=await new Promise<HTMLImageElement>((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>fail(Error('This image could not be decoded'));i.src=url;});
  let w=img.naturalWidth,h=img.naturalHeight;
  if(!w||!h){if(from==='svg'){w=1024;h=1024;}else throw Error('Image has no size');}
  if(from==='svg'&&w*h<=1){w=1024;h=1024;}
  if(w*h>MAX_PIXELS||w>MAX_SIDE||h>MAX_SIDE)throw Error('Image is too large to convert (limit 16 megapixels)');
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const ctx=c.getContext('2d');if(!ctx)throw Error('Canvas is not available');
  if(to==='jpg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);}
  ctx.drawImage(img,0,0,w,h);
  const mime=FORMATS[to].mime;
  const out=await new Promise<Blob|null>(r=>c.toBlob(r,mime,quality));
  if(!out||out.type!==mime)throw Error(`This system cannot encode ${FORMATS[to].label}`);
  const data=new Uint8Array(await out.arrayBuffer());
  if(sniffBinary(data)!==to)throw Error(`This system produced a file that is not a valid ${FORMATS[to].label}`);
  return data;
 }finally{URL.revokeObjectURL(url);}};
