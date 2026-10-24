import {rgbToHsl} from './hslMixer';
/**
 * Lens correction in the source preprocessing chain: elliptical vignette (correction or effect)
 * and defringe (desaturating purple/green fringes at contrast edges). No lens profiles: the
 * vignette is a centered elliptical falloff, defringe is a gradient threshold plus hue windows.
 */
export const VIGNETTE_AMOUNT=100,VIGNETTE_MIDPOINT=100,DEFRINGE=100;
export const vignetteNeutral=(amount:number)=>amount===0;
export const defringeNeutral=(strength:number)=>strength===0;
interface Frame{bytes:ArrayBuffer;width:number;height:number;}
const smooth=(t:number)=>t<=0?0:t>=1?1:t*t*(3-2*t);
/**
 * Elliptical falloff from the frame center: pixels beyond the midpoint (0=falloff starts at the
 * center, 100=only the far edge) gain 2^((amount/100)*w) - positive amounts brighten the corners
 * (correction), negative darken them (effect). Aspect-true: corner distance is normalized to 1.
 */
export function applyVignette(frame:Frame,amount:number,midpoint:number):Frame{
 if(amount===0)return frame;
 const{width:w,height:h}=frame;
 const out=new Uint8Array(frame.bytes.slice(0)); // copy: never mutate the caller's frame
 const m=Math.min(1,Math.max(0,midpoint/100)),span=Math.max(0.02,1-m);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const dx=(x-(w-1)/2)/Math.max(1,(w-1)/2),dy=(y-(h-1)/2)/Math.max(1,(h-1)/2);
  const d=Math.min(1,Math.hypot(dx,dy)/Math.SQRT2);
  const wgt=smooth((d-m)/span);
  if(wgt<=0)continue;
  const gain=Math.pow(2,(amount/100)*wgt),i=(y*w+x)*4;
  out[i]=Math.min(255,Math.max(0,Math.round(out[i]*gain)));
  out[i+1]=Math.min(255,Math.max(0,Math.round(out[i+1]*gain)));
  out[i+2]=Math.min(255,Math.max(0,Math.round(out[i+2]*gain)));
 }
 return{bytes:out.buffer as ArrayBuffer,width:w,height:h};
}
/** Fringe hue windows in degrees: purple/magenta and green, the two classic CA colors. */
const isFringeHue=(h:number)=>(h>=255&&h<=335)||(h>=80&&h<=170);
/**
 * Desaturates fringe-colored pixels only at contrast edges: a pixel qualifies when its luma
 * gradient against its neighbors clears a threshold and its hue sits in a fringe window. Flat
 * purple regions (no edge) and edge pixels in other hues stay untouched. Strength scales the mix.
 */
export function applyDefringe(frame:Frame,strength:number):Frame{
 if(strength===0)return frame;
 const{width:w,height:h}=frame;
 if(w<3||h<3)return frame;
 const src=new Uint8Array(frame.bytes);
 const out=new Uint8Array(frame.bytes.slice(0));
 const lumaAt=(x:number,y:number)=>{const i=(y*w+x)*4;return 0.2126*src[i]+0.7152*src[i+1]+0.0722*src[i+2];};
 const s=Math.min(1,Math.max(0,strength/100));
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const grad=Math.abs(lumaAt(x+1,y)-lumaAt(x-1,y))+Math.abs(lumaAt(x,y+1)-lumaAt(x,y-1));
  if(grad<=40)continue;
  const i=(y*w+x)*4;
  const [hh,ss]=rgbToHsl(src[i],src[i+1],src[i+2]);
  if(ss<0.15||!isFringeHue(hh))continue;
  const mix=s*Math.min(1,(grad-40)/120);if(mix<=0)continue;
  const l=lumaAt(x,y);
  out[i]=Math.min(255,Math.max(0,Math.round(l+(src[i]-l)*(1-mix))));
  out[i+1]=Math.min(255,Math.max(0,Math.round(l+(src[i+1]-l)*(1-mix))));
  out[i+2]=Math.min(255,Math.max(0,Math.round(l+(src[i+2]-l)*(1-mix))));
 }
 return{bytes:out.buffer as ArrayBuffer,width:w,height:h};
}
