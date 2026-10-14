/** Local adjustment mask: persistent dabs on the source, brightened/darkened and (de)saturated before the engine loads it. Same normalized model as healSpots; r is a fraction of the frame's smaller side. */
import {spotCoverage} from './healSpots';

export interface MaskDab{x:number;y:number;r:number;}

const clamp01=(v:number)=>Math.min(1,Math.max(0,v));
export const DAB_MIN_R=0.002,DAB_MAX_R=0.5,MAX_DABS=200;

export function clampDab(d:MaskDab):MaskDab{
 return{x:clamp01(d.x),y:clamp01(d.y),r:Math.min(DAB_MAX_R,Math.max(DAB_MIN_R,d.r))};
}
export function validDab(d:unknown):d is MaskDab{
 if(!d||typeof d!=='object')return false;
 const p=d as Record<string,unknown>;
 return Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.r)&&(p.x as number)>=0&&(p.x as number)<=1&&(p.y as number)>=0&&(p.y as number)<=1&&(p.r as number)>=DAB_MIN_R&&(p.r as number)<=DAB_MAX_R;
}
/** Stable identity of the mask plus its strengths: drives the engine reload invariant and the settings signature. */
export const dabSignature=(dabs:readonly MaskDab[])=>JSON.stringify(dabs.map(d=>[d.x,d.y,d.r]));

/** Linear graduated filter: strength ramps from full at the (x0,y0) plane to zero at the (x1,y1) plane. Normalized coords like dabs. */
export interface GradFilter{x0:number;y0:number;x1:number;y1:number;}
export const GRAD_MIN_LEN=0.02,MAX_GRADS=20;

export function clampGrad(g:GradFilter):GradFilter{
 const c:GradFilter={x0:clamp01(g.x0),y0:clamp01(g.y0),x1:clamp01(g.x1),y1:clamp01(g.y1)};
 const dx=c.x1-c.x0,dy=c.y1-c.y0,len=Math.hypot(dx,dy);
 if(len>=GRAD_MIN_LEN)return c;
 const ux=len>1e-6?dx/len:0,uy=len>1e-6?dy/len:1; // a degenerate drag extends downward to the minimum length
 return{x0:c.x0,y0:c.y0,x1:clamp01(c.x0+ux*GRAD_MIN_LEN),y1:clamp01(c.y0+uy*GRAD_MIN_LEN)};
}
export function validGrad(g:unknown):g is GradFilter{
 if(!g||typeof g!=='object')return false;
 const p=g as Record<string,unknown>;
 if(!(['x0','y0','x1','y1'] as const).every(k=>Number.isFinite(p[k])))return false;
 const v=p as unknown as GradFilter;
 return v.x0>=0&&v.x0<=1&&v.y0>=0&&v.y0<=1&&v.x1>=0&&v.x1<=1&&v.y1>=0&&v.y1<=1&&Math.hypot(v.x1-v.x0,v.y1-v.y0)>=GRAD_MIN_LEN;
}
/** Stable identity of the graduated filters: feeds the engine reload invariant and the settings signature. */
export const gradSignature=(grads:readonly GradFilter[])=>JSON.stringify(grads.map(g=>[g.x0,g.y0,g.x1,g.y1]));

interface Frame{bytes:ArrayBuffer;width:number;height:number;}
/**
 * Applies the local mask: per pixel under a dab, channels scale by 2^(ev*w) and then lerp toward
 * luma by sat% (negative desaturates), with w the dab's soft coverage. Returns the input unchanged
 * when there is nothing to apply; otherwise a fresh frame, dabs in order.
 */
export function applyLocalAdjust(frame:Frame,dabs:readonly MaskDab[],ev:number,sat:number):Frame{
 if(dabs.length===0||(ev===0&&sat===0))return frame;
 const{width:w,height:h}=frame;
 const out=new Uint8Array(frame.bytes.slice(0)); // copy: never mutate the caller's frame
 const R=Math.min(w,h);
 for(const dab of dabs){
  const cx=dab.x*w,cy=dab.y*h,rad=Math.max(1,dab.r*R);
  const x0=Math.max(0,Math.floor(cx-rad)),x1=Math.min(w-1,Math.ceil(cx+rad));
  const y0=Math.max(0,Math.floor(cy-rad)),y1=Math.min(h-1,Math.ceil(cy+rad));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const nx=(x-cx)/rad,ny=(y-cy)/rad;
   const wgt=spotCoverage(Math.sqrt(nx*nx+ny*ny));
   if(wgt<=0)continue;
   const i=(y*w+x)*4;
   const gain=Math.pow(2,ev*wgt),mix=(sat/100)*wgt;
   let r=out[i]*gain,g=out[i+1]*gain,b=out[i+2]*gain;
   if(mix!==0){const l=0.2126*r+0.7152*g+0.0722*b;r=l+(r-l)*(1+mix);g=l+(g-l)*(1+mix);b=l+(b-l)*(1+mix);}
   out[i]=Math.min(255,Math.max(0,Math.round(r)));
   out[i+1]=Math.min(255,Math.max(0,Math.round(g)));
   out[i+2]=Math.min(255,Math.max(0,Math.round(b)));
  }
 }
 return{bytes:out.buffer as ArrayBuffer,width:w,height:h};
}

/**
 * Applies graduated filters on top of the (already dab-adjusted) frame: per pixel the weight is the
 * smooth coverage along each filter's ramp (1 at and before the start plane, 0 at and beyond the end
 * plane, spotCoverage's smooth falloff between), then the same EV/luma math as the dab mask. Returns
 * the input unchanged when there is nothing to apply; otherwise a fresh frame, filters in order.
 */
export function applyGradFilters(frame:Frame,grads:readonly GradFilter[],ev:number,sat:number):Frame{
 if(grads.length===0||(ev===0&&sat===0))return frame;
 const{width:w,height:h}=frame;
 const out=new Uint8Array(frame.bytes.slice(0)); // copy: never mutate the caller's frame
 for(const g of grads){
  const ax=g.x0*w,ay=g.y0*h,bx=g.x1*w,by=g.y1*h;
  const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy;
  if(len2<1e-6)continue;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const t=((x-ax)*dx+(y-ay)*dy)/len2;
   const wgt=spotCoverage(Math.min(1,Math.max(0,t)));
   if(wgt<=0)continue;
   const i=(y*w+x)*4;
   const gain=Math.pow(2,ev*wgt),mix=(sat/100)*wgt;
   let r=out[i]*gain,g2=out[i+1]*gain,b=out[i+2]*gain;
   if(mix!==0){const l=0.2126*r+0.7152*g2+0.0722*b;r=l+(r-l)*(1+mix);g2=l+(g2-l)*(1+mix);b=l+(b-l)*(1+mix);}
   out[i]=Math.min(255,Math.max(0,Math.round(r)));
   out[i+1]=Math.min(255,Math.max(0,Math.round(g2)));
   out[i+2]=Math.min(255,Math.max(0,Math.round(b)));
  }
 }
 return{bytes:out.buffer as ArrayBuffer,width:w,height:h};
}
