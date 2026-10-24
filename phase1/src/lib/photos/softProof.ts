/** Print soft-proof as a documented mathematical model - NOT an ICC profile (no color-management dependency). The model: a pixel is printable when its chroma (max-min channel) stays under a luma-dependent boundary (triangle, peak at mid tones: saturated brights and deep saturated shadows are what a print gamut loses). The proof view compresses out-of-gamut chroma toward the luma gray, lifts pure black to an ink black and maps pure white onto a warm paper white. */
import {lumaOf} from './histogram';
export interface PhotoFrameLike{bytes:ArrayBuffer;width:number;height:number;}
export interface SoftProofModel{
 /** Max printable chroma at mid luma, 0..255. Lower = narrower gamut. */
 chromaPeak:number;
 /** Ink black floor: pure black prints this bright, 0..255. */
 blackLift:number;
 /** Paper white per channel, RGB 0..255: pure white prints as this. */
 paperWhite:[number,number,number];
}
export const DEFAULT_PRINT_MODEL:SoftProofModel={chromaPeak:150,blackLift:14,paperWhite:[245,241,231]};
/** The selectable print models: coated stock (default), uncoated (narrower gamut, more ink lift, warmer paper), newsprint (narrowest). Still one documented model family - parameters, no ICC. */
export const SOFT_PROOF_MODELS:Record<'coated'|'uncoated'|'newsprint',SoftProofModel>={coated:DEFAULT_PRINT_MODEL,uncoated:{chromaPeak:120,blackLift:22,paperWhite:[238,232,218]},newsprint:{chromaPeak:95,blackLift:30,paperWhite:[235,230,215]}};
export type SoftProofModelId=keyof typeof SOFT_PROOF_MODELS;
export const SOFT_PROOF_MODEL_IDS=Object.keys(SOFT_PROOF_MODELS) as SoftProofModelId[];
/** False-color for out-of-gamut pixels (magenta - deliberately not the clipping overlay's blue/red). */
export const GAMUT_WARN:[number,number,number]=[255,32,255];
/** Printable chroma ceiling at a given luma: 0 at black and white, chromaPeak at mid tones. */
export const chromaBoundary=(y:number,model:SoftProofModel=DEFAULT_PRINT_MODEL):number=>model.chromaPeak*(1-Math.abs((2*y)/255-1));
export const chromaOf=(r:number,g:number,b:number)=>Math.max(r,g,b)-Math.min(r,g,b);
export const isOutOfGamut=(r:number,g:number,b:number,model:SoftProofModel=DEFAULT_PRINT_MODEL):boolean=>chromaOf(r,g,b)>chromaBoundary(lumaOf(r,g,b),model);
const proofPixel=(r:number,g:number,b:number,m:SoftProofModel):[number,number,number]=>{
 const y=lumaOf(r,g,b);
 const c=chromaOf(r,g,b);
 const bound=chromaBoundary(y,m);
 const scale=c>bound&&c>0?bound/c:1; // compress out-of-gamut chroma toward the luma gray
 const cr=y+(r-y)*scale,cg=y+(g-y)*scale,cb=y+(b-y)*scale;
 return[ // paper + ink: black -> blackLift, white -> paperWhite, per channel
  Math.round(m.blackLift+cr*((m.paperWhite[0]-m.blackLift)/255)),
  Math.round(m.blackLift+cg*((m.paperWhite[1]-m.blackLift)/255)),
  Math.round(m.blackLift+cb*((m.paperWhite[2]-m.blackLift)/255)),
 ];
};
/** Share of opaque pixels, 0..1, outside the printable gamut - the proof panel's figure. */
export function gamutShare(bytes:ArrayBuffer,width:number,height:number,model:SoftProofModel=DEFAULT_PRINT_MODEL):number{
 const src=new Uint8Array(bytes);
 const pixels=width*height;
 let oog=0,opaque=0;
 for(let p=0;p<pixels;p++){
  const o=p*4;if(src[o+3]===0)continue;
  opaque++;
  if(isOutOfGamut(src[o],src[o+1],src[o+2],model))oog++;
 }
 return opaque===0?0:oog/opaque;
}
/** The simulated print look over a rendered preview frame. */
export function softProofImage(frame:PhotoFrameLike,model:SoftProofModel=DEFAULT_PRINT_MODEL):PhotoFrameLike{
 const src=new Uint8Array(frame.bytes);
 const out=new Uint8ClampedArray(frame.width*frame.height*4);
 const pixels=frame.width*frame.height;
 for(let p=0;p<pixels;p++){
  const o=p*4;
  if(src[o+3]===0)continue;
  const[r,g,b]=proofPixel(src[o],src[o+1],src[o+2],model);
  out[o]=r;out[o+1]=g;out[o+2]=b;out[o+3]=src[o+3];
 }
 return{bytes:out.buffer as ArrayBuffer,width:frame.width,height:frame.height};
}
/** False-color overlay of the out-of-gamut pixels, same shape as the clipping overlay: OOG becomes solid magenta, everything else transparent. */
export function gamutWarningImage(frame:PhotoFrameLike,model:SoftProofModel=DEFAULT_PRINT_MODEL):PhotoFrameLike{
 const src=new Uint8Array(frame.bytes);
 const out=new Uint8ClampedArray(frame.width*frame.height*4);
 const pixels=frame.width*frame.height;
 for(let p=0;p<pixels;p++){
  const o=p*4;
  if(src[o+3]===0||!isOutOfGamut(src[o],src[o+1],src[o+2],model))continue;
  out[o]=GAMUT_WARN[0];out[o+1]=GAMUT_WARN[1];out[o+2]=GAMUT_WARN[2];out[o+3]=255;
 }
 return{bytes:out.buffer as ArrayBuffer,width:frame.width,height:frame.height};
}
