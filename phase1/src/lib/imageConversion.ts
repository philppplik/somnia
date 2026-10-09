import {RASTER_ACCEPT,sniffRaster,decodeRasterPreview} from './rasterPreview';
/** Local-only conversion, with bounded WASM adapters for additional raster formats. */
export type ImageFormat = 'png' | 'jpeg' | 'webp';
export interface ImageSize { width: number; height: number }
export interface ImageConversionOptions { format: ImageFormat; width?: number; height?: number; quality?: number; background?: string }
export interface ConvertedImage extends ImageSize { blob: Blob; filename: string }
export const MAX_IMAGE_BYTES = 25_000_000;
export const MAX_IMAGE_PIXELS = 32_000_000;
export const MAX_IMAGE_EDGE = 8192;
export const IMAGE_CONVERSION_ACCEPT = '.svg,'+RASTER_ACCEPT;
export const imageMime = (format: ImageFormat) => ({png:'image/png',jpeg:'image/jpeg',webp:'image/webp'}[format]);
export function validateImageSize(size: ImageSize): ImageSize {
 if (![size.width,size.height].every(v=>Number.isInteger(v)&&v>0&&v<=MAX_IMAGE_EDGE) || size.width*size.height>MAX_IMAGE_PIXELS)
  throw Error('Image size must be whole pixels, at most 8192 per side and 32 million pixels in total.');
 return size;
}
export function targetImageSize(source: ImageSize, width?: number, height?: number): ImageSize {
 validateImageSize(source);
 return validateImageSize({width:width??(height===undefined?source.width:Math.max(1,Math.round(source.width*height/source.height))),height:height??(width===undefined?source.height:Math.max(1,Math.round(source.height*width/source.width)))});
}
export function convertedImageName(name: string, format: ImageFormat): string {
 const base=(name.split(/[\\/]/).pop()??'image').replace(/\.[^.]*$/,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
 return `${base||'image'}.${format==='jpeg'?'jpg':format}`;
}
/** Read signatures instead of trusting the picker extension or the supplied MIME. */
export function rasterImageMime(bytes: Uint8Array): string | null {
 const starts=(v:number[])=>v.every((x,i)=>bytes[i]===x);
 if(starts([137,80,78,71,13,10,26,10]))return 'image/png';
 if(starts([255,216,255]))return 'image/jpeg';
 if(starts([82,73,70,70])&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80)return 'image/webp';
 return null;
}
const SVG_NS='http://www.w3.org/2000/svg';
/** Standalone SVGs only. Reject active/embedded/external content, never fetch dependencies. */
export function standaloneSvg(text:string): {blob:Blob;size:ImageSize} {
 if(/<!DOCTYPE|<!ENTITY|<\?/i.test(text.replace(/^\s*<\?xml[^?]*\?>/i,'')))throw Error('SVG declarations and processing instructions are not supported.');
 const doc=new DOMParser().parseFromString(text,'image/svg+xml');const root=doc.documentElement;
 if(doc.querySelector('parsererror')||root.localName!=='svg'||root.namespaceURI!==SVG_NS)throw Error('Not a valid standalone SVG image.');
 for(const el of Array.from(root.querySelectorAll('*')).concat(root)){
  if(el.namespaceURI!==SVG_NS||['script','foreignobject','image','feimage','animate','animatetransform','animatemotion','set','discard'].includes(el.localName.toLowerCase()))throw Error('SVG scripts, animation and embedded images are not supported.');
  for(const attr of Array.from(el.attributes)){
   const name=attr.localName.toLowerCase();const value=attr.value.trim();
   if(name.startsWith('on'))throw Error('SVG event handlers are not supported.');
   if(name==='href'&&value&&!/^#[A-Za-z_][\w:.-]*$/.test(value))throw Error('SVG external references are not supported.');
   if(name==='base'||name==='src')throw Error('SVG external references are not supported.');
   checkSvgCss(value);
  }
  if(el.localName==='style')checkSvgCss(el.textContent??'');
 }
 const vb=root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
 const box=vb?.length===4&&vb.every(Number.isFinite)&&vb[2]>0&&vb[3]>0?{width:vb[2],height:vb[3]}:null;
 const length=(value:string|null)=>{const m=value?.trim().match(/^(\d+(?:\.\d+)?)(px|pt|pc|in|cm|mm)?$/);if(!m)return undefined;return Number(m[1])*({px:1,pt:96/72,pc:16,in:96,cm:96/2.54,mm:96/25.4}[m[2]||'px']??1);};
 let width=length(root.getAttribute('width')),height=length(root.getAttribute('height'));
 if(width===undefined&&height!==undefined&&box)width=height*box.width/box.height;
 if(height===undefined&&width!==undefined&&box)height=width*box.height/box.width;
 width??=box?.width;height??=box?.height;
 if(!width||!height)throw Error('SVG needs positive width and height or a viewBox.');
 const size=validateImageSize({width:Math.max(1,Math.round(width)),height:Math.max(1,Math.round(height))});
 root.setAttribute('width',String(size.width));root.setAttribute('height',String(size.height));
 return {blob:new Blob([new XMLSerializer().serializeToString(root)],{type:'image/svg+xml'}),size};
}
function checkSvgCss(value:string){
 // Reject CSS escapes/comments that could hide a URL, imports, fonts or active schemes.
 if(/\\|\/\*|@import|@font-face|javascript:|https?:|file:|data:|expression\(/i.test(value.replace(/^http:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink)$/, '')))throw Error('SVG external resources and escaped CSS are not supported.');
 for(const match of value.matchAll(/url\s*\(([^)]*)\)/gi))if(!/^['"]?#[A-Za-z_][\w:.-]*['"]?$/.test(match[1].trim()))throw Error('SVG external resources are not supported.');
}
export async function loadConversionImage(file: Blob, name=''): Promise<{image:HTMLImageElement;size:ImageSize;dispose:()=>void}> {
 if(!file.size||file.size>MAX_IMAGE_BYTES)throw Error('Choose an image of at most 25 MB.');
 const mime=sniffRaster(new Uint8Array(await file.slice(0,256).arrayBuffer()));
 const native=mime&&['image/png','image/jpeg','image/webp'].includes(mime);
 const raster=native?{blob:new Blob([file],{type:mime})}:mime||/\.tga$/i.test(name)?await decodeRasterPreview(file,name,mime):null;
 const svg=raster?null:standaloneSvg(await file.text());
 const blob=svg?.blob??raster!.blob;const url=URL.createObjectURL(blob);const image=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{image.src='';reject(Error('Image decoding timed out.'));},15_000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(Error('This image is damaged or its format is not supported.'));};image.src=url;});
  const size=validateImageSize(svg?.size??{width:image.naturalWidth,height:image.naturalHeight});
  return{image,size,dispose:()=>{image.src='';URL.revokeObjectURL(url);}};
 }catch(error){image.src='';URL.revokeObjectURL(url);throw error;}
}
export async function convertImage(file: Blob, name: string, options: ImageConversionOptions): Promise<ConvertedImage> {
 if(!['png','jpeg','webp'].includes(options.format))throw Error('Choose PNG, JPEG or WebP.');
 const quality=options.quality??0.92;if(!Number.isFinite(quality)||quality<0||quality>1)throw Error('Quality must be between 0 and 1.');
 const background=options.background??'#ffffff';if(!/^#[0-9a-f]{6}$/i.test(background))throw Error('Background must be a six-digit hex colour.');
 const source=await loadConversionImage(file,name);
 try{
  const size=targetImageSize(source.size,options.width,options.height);const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
  try{
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas is unavailable in this browser.');
   if(options.format==='jpeg'){ctx.fillStyle=background;ctx.fillRect(0,0,size.width,size.height);}
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source.image,0,0,size.width,size.height);
   const mime=imageMime(options.format);const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,mime,quality));
   // Older WebViews silently return PNG for an unsupported encoder. Never mislabel it.
   if(!blob||blob.type!==mime)throw Error(`${options.format.toUpperCase()} encoding is not supported in this browser. Choose PNG or JPEG.`);
   return {...size,blob,filename:convertedImageName(name,options.format)};
  }finally{canvas.width=0;canvas.height=0;}
 }finally{source.dispose();}
}
export function downloadConvertedImage(result:ConvertedImage){
 const url=URL.createObjectURL(result.blob);const link=document.createElement('a');link.href=url;link.download=result.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
