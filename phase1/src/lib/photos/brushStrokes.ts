import {clampDab,validDab,type MaskDab} from './localAdjust';
/**
 * Adjustment-brush stroke: a chain of soft dabs carrying their own exposure, temperature and
 * saturation values. Values freeze when the stroke is painted; a stroke is edited by deleting
 * and repainting it. Rastered into the source before the engine loads it, like dabs/grads/rads.
 */
export interface BrushStroke{dabs:MaskDab[];ev:number;temp:number;sat:number}
export const MAX_BRUSH_STROKES=20,MAX_BRUSH_TOTAL_DABS=200,BRUSH_EV=1,BRUSH_TEMP=100,BRUSH_SAT=100;
export const brushTotalDabs=(strokes:readonly BrushStroke[])=>strokes.reduce((n,s)=>n+s.dabs.length,0);
export function clampStroke(s:BrushStroke):BrushStroke{
 const cl=(v:number,r:number)=>Math.min(r,Math.max(-r,Number.isFinite(v)?v:0));
 return{dabs:s.dabs.slice(0,MAX_BRUSH_TOTAL_DABS).map(clampDab),ev:cl(s.ev,BRUSH_EV),temp:cl(s.temp,BRUSH_TEMP),sat:cl(s.sat,BRUSH_SAT)};
}
export function validStroke(s:unknown):s is BrushStroke{
 if(!s||typeof s!=='object')return false;
 const {dabs,ev,temp,sat}=s as Record<string,unknown>;
 return Array.isArray(dabs)&&dabs.length>0&&dabs.every(validDab)&&[ev,temp,sat].every(v=>typeof v==='number'&&Number.isFinite(v));
}
export const brushSignature=(strokes:readonly BrushStroke[])=>JSON.stringify(strokes.map(s=>[s.ev,s.temp,s.sat,s.dabs.map(d=>[d.x,d.y,d.r])]));
/** Soft coverage of one dab at unit distance, same profile as the dodge mask: plateau to 0.7, zero at 1. */
const coverage=(d:number)=>d>=1?0:d<=0.7?1:(1-(d-0.7)/0.3);
interface Frame{bytes:ArrayBuffer;width:number;height:number;}
/**
 * Applies brush strokes in order: per pixel the strongest covering dab of the stroke sets the
 * weight; channels scale by 2^(ev*w), shift warm/cool by temp*w (luma-neutral r+/b-), then lerp
 * toward luma by sat%*w. Returns the input unchanged when there is nothing to apply.
 */
export function applyBrushStrokes(frame:Frame,strokes:readonly BrushStroke[]):Frame{
 const live=strokes.filter(s=>s.dabs.length>0&&(s.ev!==0||s.temp!==0||s.sat!==0));
 if(live.length===0)return frame;
 const{width:w,height:h}=frame;
 const out=new Uint8Array(frame.bytes.slice(0)); // copy: never mutate the caller's frame
 const R=Math.min(w,h);
 for(const stroke of live){
  const weights=new Float32Array(w*h);
  for(const dab of stroke.dabs){
   const cx=dab.x*w,cy=dab.y*h,rad=Math.max(1,dab.r*R);
   const x0=Math.max(0,Math.floor(cx-rad)),x1=Math.min(w-1,Math.ceil(cx+rad));
   const y0=Math.max(0,Math.floor(cy-rad)),y1=Math.min(h-1,Math.ceil(cy+rad));
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const wgt=coverage(Math.hypot((x-cx)/rad,(y-cy)/rad));
    const p=y*w+x;if(wgt>weights[p])weights[p]=wgt;
   }
  }
  for(let p=0;p<weights.length;p++){
   const wgt=weights[p];if(wgt<=0)continue;
   const i=p*4,gain=Math.pow(2,stroke.ev*wgt),shift=stroke.temp*0.5*wgt,mix=(stroke.sat/100)*wgt;
   let r=out[i]*gain+shift,g=out[i+1]*gain,b=out[i+2]*gain-shift;
   if(mix!==0){const l=0.2126*r+0.7152*g+0.0722*b;r=l+(r-l)*(1+mix);g=l+(g-l)*(1+mix);b=l+(b-l)*(1+mix);}
   out[i]=Math.min(255,Math.max(0,Math.round(r)));
   out[i+1]=Math.min(255,Math.max(0,Math.round(g)));
   out[i+2]=Math.min(255,Math.max(0,Math.round(b)));
  }
 }
 return{bytes:out.buffer as ArrayBuffer,width:w,height:h};
}
