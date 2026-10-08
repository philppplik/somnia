import type {RasterImage} from '../image/buffer';
import type {CraftEngine} from './engine';
import type {CraftResponse} from './protocol';
export const CRAFT_PIXEL_LIMIT=1_048_576;
/** Extend edge pixels before PhotoCraft's transparent-boundary filter, then crop.
 * 4 sigma exceeds the support of the small exact kernel and three box passes.
 * Reject instead of silently reducing the requested radius. */
export function clampPadding(input:RasterImage,radius:number){
 if(!Number.isFinite(radius)||radius<0||radius>32)throw RangeError('Craft preview radius must be 0..32');
 const pad=Math.ceil(radius*4)+2,width=input.width+pad*2,height=input.height+pad*2;
 if(width>4096||height>4096||width*height>CRAFT_PIXEL_LIMIT)throw RangeError('Craft preview exceeds bounded workspace');
 const bytes=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++){const sy=Math.min(input.height-1,Math.max(0,y-pad));for(let x=0;x<width;x++){const sx=Math.min(input.width-1,Math.max(0,x-pad));bytes.set(input.data.subarray((sy*input.width+sx)*4,(sy*input.width+sx)*4+4),(y*width+x)*4);}}
 return{bytes,width,height,pad};
}
export function cropPadding(output:ArrayBuffer,width:number,height:number,pad:number,source:{width:number;height:number}):RasterImage{
 if(output.byteLength!==width*height*4)throw Error('Craft result byte length mismatch');const bytes=new Uint8Array(output),data=new Uint8ClampedArray(source.width*source.height*4);
 for(let y=0;y<source.height;y++){const start=((y+pad)*width+pad)*4;data.set(bytes.subarray(start,start+source.width*4),y*source.width*4);}return {...source,data};
}
/** Preview-only bridge. Full-resolution save continues through the existing reference pipeline. */
export class CraftBlurPreview{
 private engine?:CraftEngine;private ready?:Promise<CraftResponse>;private failed=false;
 constructor(private report:(message:string)=>void=()=>{}){}
 async render(input:RasterImage,radius:number,signal?:AbortSignal){
  signal?.throwIfAborted();const padded=clampPadding(input,radius);
  if(this.failed)throw Error('Craft preview unavailable for this session');
  try{
   if(!this.engine){const {CraftEngine}=await import('./engine');this.engine=new CraftEngine();this.ready=this.engine.init();}
   await this.ready;signal?.throwIfAborted();const result=await this.engine.blur(padded.bytes.buffer,padded.width,padded.height,radius);
   signal?.throwIfAborted();if(!result.ok||result.kind!=='result')throw Error('Invalid craft pixel response');
   return cropPadding(result.bytes,padded.width,padded.height,padded.pad,input);
  }catch(e){if(signal?.aborted)throw e;this.failed=true;this.engine?.dispose();this.report('PhotoCraft preview unavailable. Using the existing image renderer.');throw e;}
 }
 dispose(){this.failed=true;this.engine?.dispose();}
}
