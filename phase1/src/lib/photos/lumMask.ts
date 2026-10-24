import {rgbToHsl} from './hslMixer';
/**
 * Luminosity/colour-range mask: ONE active mask selecting pixels by luma window (with feather)
 * and optionally by hue window (achromatic pixels never match a hue window). ev/temp/sat apply
 * through the mask weight, rastered into the source between the brush strokes and the curves.
 */
export interface LumMask{
 lumaLo:number;     // 0..1, window start
 lumaHi:number;     // 0..1, window end (sanitize keeps lo<=hi)
 feather:number;    // 0..0.5, soft edge width as a fraction of the luma range
 hueCenter:number|null; // null = luma-only; otherwise 0..360 degrees
 hueRange:number;   // 5..180 degrees half-width, 30 deg soft edge
 ev:number;         // -1..1 stops
 temp:number;       // -100..100 display delta
 sat:number;        // -100..100
}
export const neutralLumMask=():LumMask=>({lumaLo:0,lumaHi:1,feather:0.1,hueCenter:null,hueRange:60,ev:0,temp:0,sat:0});
/** A mask whose adjustments are all zero changes nothing, whatever the window. */
export const lumMaskNeutral=(m:LumMask)=>m.ev===0&&m.temp===0&&m.sat===0;
/** A full-frame window (no luma narrowing, no hue window) paints no meaningful weight map: the overlay hides. */
export const lumMaskWindowNeutral=(m:LumMask)=>m.lumaLo===0&&m.lumaHi===1&&m.hueCenter===null;
const cl=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,Number.isFinite(v)?v:0));
export function clampLumMask(m:LumMask):LumMask{
 const lo=cl(m.lumaLo,0,1),hi=cl(m.lumaHi,0,1);
 return{lumaLo:Math.min(lo,hi),lumaHi:Math.max(lo,hi),feather:cl(m.feather,0,0.5),
  hueCenter:typeof m.hueCenter==='number'&&Number.isFinite(m.hueCenter)?((m.hueCenter%360)+360)%360:null,
  hueRange:cl(m.hueRange,5,180),ev:cl(m.ev,-1,1),temp:cl(m.temp,-100,100),sat:cl(m.sat,-100,100)};
}
export function validLumMask(m:unknown):m is LumMask{
 if(!m||typeof m!=='object')return false;
 const {lumaLo,lumaHi,feather,hueCenter,hueRange,ev,temp,sat}=m as Record<string,unknown>;
 return[lumaLo,lumaHi,feather,hueRange,ev,temp,sat].every(v=>typeof v==='number'&&Number.isFinite(v))&&(hueCenter===null||typeof hueCenter==='number');
}
export const lumMaskSignature=(m:LumMask)=>JSON.stringify([m.lumaLo,m.lumaHi,m.feather,m.hueCenter,m.hueRange,m.ev,m.temp,m.sat]);
const smooth=(t:number)=>t<=0?0:t>=1?1:t*t*(3-2*t);
/** Mask weight 0..1 for one pixel: trapezoid luma window, times a soft hue window when active. */
export function lumMaskWeight(luma:number,hue:number,sat:number,m:LumMask):number{
 const f=Math.max(0.005,m.feather);
 const wl=smooth((luma-(m.lumaLo-f))/(2*f))*smooth(((m.lumaHi+f)-luma)/(2*f));
 if(wl<=0)return 0;
 if(m.hueCenter===null)return wl;
 if(sat<0.08)return 0; // achromatic pixels have no meaningful hue
 const dh=Math.min(Math.abs(hue-m.hueCenter),360-Math.abs(hue-m.hueCenter));
 return wl*(1-smooth((dh-m.hueRange)/30));
}
interface Frame{bytes:ArrayBuffer;width:number;height:number;}
const L=(r:number,g:number,b:number)=>0.2126*r+0.7152*g+0.0722*b;
/** Applies ev/temp/sat through the mask (same math as the brush strokes). Input is never mutated. */
export function applyLumMask(frame:Frame,m:LumMask):Frame{
 if(lumMaskNeutral(m))return frame;
 const{width:w,height:h}=frame;
 const out=new Uint8Array(frame.bytes.slice(0)); // copy: never mutate the caller's frame
 for(let p=0;p<w*h;p++){
  const i=p*4,r=out[i],g=out[i+1],b=out[i+2];
  const [hh,ss]=rgbToHsl(r,g,b);
  const wgt=lumMaskWeight(L(r,g,b)/255,hh,ss,m);
  if(wgt<=0)continue;
  const gain=Math.pow(2,m.ev*wgt),shift=m.temp*0.5*wgt,mix=(m.sat/100)*wgt;
  let nr=r*gain+shift,ng=g*gain,nb=b*gain-shift;
  if(mix!==0){const l=0.2126*nr+0.7152*ng+0.0722*nb;nr=l+(nr-l)*(1+mix);ng=l+(ng-l)*(1+mix);nb=l+(nb-l)*(1+mix);}
  out[i]=Math.min(255,Math.max(0,Math.round(nr)));
  out[i+1]=Math.min(255,Math.max(0,Math.round(ng)));
  out[i+2]=Math.min(255,Math.max(0,Math.round(nb)));
 }
 return{bytes:out.buffer as ArrayBuffer,width:w,height:h};
}
/** Tonal-zone presets for the panel buttons: overlapping windows, the feather softens the seams. */
export const LUM_ZONES:readonly {id:string;labelKey:string;lo:number;hi:number}[]=[
 {id:'shadows',labelKey:'photos.p.mask.shadows',lo:0,hi:0.35},
 {id:'midtones',labelKey:'photos.p.mask.midtones',lo:0.3,hi:0.7},
 {id:'highlights',labelKey:'photos.p.mask.highlights',lo:0.65,hi:1},
];
