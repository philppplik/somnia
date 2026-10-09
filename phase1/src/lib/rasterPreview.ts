/** Import-only decode bridge. Output is a flattened RGBA8 PNG, never the original file. */
export const RASTER_EXTENSIONS='png|jpe?g|webp|gif|avif|bmp|ico|tga|tiff?|qoi|ppm|pnm';
export const RASTER_FILE=new RegExp(`\\.(${RASTER_EXTENSIONS})$`,'i');
export const RASTER_ACCEPT='.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp,.ico,.tga,.tif,.tiff,.qoi,.ppm,.pnm';
export const FLATTEN_WARNING='Preview / conversion only. First image or frame; layers, animation, ICC/CMYK and high bit depth are not preserved. The original file is unchanged.';
export function sniffRaster(bytes:Uint8Array):string|null {
 const b=(...v:number[])=>v.every((x,i)=>bytes[i]===x);
 const ascii=(a:number,n:number)=>String.fromCharCode(...bytes.slice(a,a+n));
 if(b(137,80,78,71,13,10,26,10))return 'image/png';
 if(b(255,216,255))return 'image/jpeg';
 if(ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP')return 'image/webp';
 if(['GIF87a','GIF89a'].includes(ascii(0,6)))return 'image/gif';
 if(b(66,77))return 'image/bmp';
 if(b(0,0,1,0))return 'image/x-icon';
 if(b(73,73,42,0)||b(77,77,0,42)||b(73,73,43,0)||b(77,77,0,43))return 'image/tiff';
 if(ascii(0,4)==='qoif')return 'image/qoi';
 if(bytes[0]===80&&bytes[1]>=49&&bytes[1]<=55&&[9,10,13,32].includes(bytes[2]))return 'image/x-portable-anymap';
 // ISO BMFF major or compatible brands. HEIF is not silently called AVIF.
 if(bytes.length>=16&&ascii(4,4)==='ftyp'){
  const size=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
  for(let i=8;i+4<=Math.min(size,bytes.length,256);i+=4)if(i!==12&&['avif','avis'].includes(ascii(i,4)))return 'image/avif';
 }
 return null;
}
async function browserDecode(blob:Blob,mime:string):Promise<Blob>{
 const url=URL.createObjectURL(new Blob([blob],{type:mime}));const image=new Image();
 try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{image.src='';reject(Error('Image decoding timed out.'));},15000);
 image.onload=()=>{clearTimeout(timer);const w=image.naturalWidth,h=image.naturalHeight;if(!w||!h||w>8192||h>8192||w*h>32_000_000)reject(Error('Image exceeds the preview pixel budget.'));else resolve();};
 image.onerror=()=>{clearTimeout(timer);reject(Error('This image is damaged or this WebView cannot decode it.')); };image.src=url;});
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  try{const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas is unavailable.');ctx.drawImage(image,0,0);
   const png=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!png||png.size>25_000_000)throw Error('Converted PNG exceeds the preview budget.');return png;
  }finally{canvas.width=0;canvas.height=0;}
 }
 finally{image.src='';URL.revokeObjectURL(url);}
}
export async function decodeRasterPreview(blob:Blob,name:string,mime:string|null):Promise<{blob:Blob;mime:string;warning?:string}>{
 if(!blob.size||blob.size>25_000_000)throw Error('Choose an image of at most 25 MB.');
 if(mime==='image/avif'){
  try{const decoded=await browserDecode(blob,mime);return {blob:decoded,mime:decoded.type,warning:FLATTEN_WARNING};}
  catch{throw Error('AVIF cannot be decoded by this WebView. Native AVIF is not enabled; convert to PNG first.');}
 }
 const bytes=new Uint8Array(await blob.arrayBuffer());
 const png=await new Promise<Uint8Array>((resolve,reject)=>{
  const worker=new Worker(new URL('./rasterPreview.worker.ts',import.meta.url),{type:'module'});
  const finish=()=>{clearTimeout(timer);worker.terminate();};
  const timer=setTimeout(()=>{finish();reject(Error('Image decoding timed out.'));},15000);
  worker.onmessage=e=>{finish();if(e.data.error)reject(Error(e.data.error));else resolve(new Uint8Array(e.data.png));};
  worker.onerror=()=>{finish();reject(Error('Raster decoder failed. Convert this image to PNG first.'));};
  worker.onmessageerror=()=>{finish();reject(Error('Raster decoder response could not be read.'));};
  try{worker.postMessage({bytes,name,wasmUrl:new URL('../../packages/raster-codec/pkg/somnia_raster_codec_bg.wasm',import.meta.url).href},[bytes.buffer]);}catch(error){finish();reject(error);}
 });
 return {blob:new Blob([png as BlobPart],{type:'image/png'}),mime:'image/png',warning:FLATTEN_WARNING};
}
