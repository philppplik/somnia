/** Clone-stamp spots: copy pixels from an offset source onto a feathered target disc. All coordinates normalized 0..1 of the frame; r is a fraction of the frame's smaller side. */
export interface HealSpot{x:number;y:number;r:number;dx:number;dy:number;}

export const SPOT_MIN_R=0.002,SPOT_MAX_R=0.5;
const clamp01=(v:number)=>Math.min(1,Math.max(0,v));
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);

export function clampSpot(s:HealSpot):HealSpot{
 return{x:clamp01(s.x),y:clamp01(s.y),r:Math.min(SPOT_MAX_R,Math.max(SPOT_MIN_R,s.r)),dx:Math.min(1,Math.max(-1,s.dx)),dy:Math.min(1,Math.max(-1,s.dy))};
}
export function validSpot(s:unknown):s is HealSpot{
 if(!s||typeof s!=='object')return false;
 const p=s as Record<string,unknown>;
 return finite(p.x)&&finite(p.y)&&finite(p.r)&&finite(p.dx)&&finite(p.dy)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&p.r>=SPOT_MIN_R&&p.r<=SPOT_MAX_R&&p.dx>=-1&&p.dx<=1&&p.dy>=-1&&p.dy<=1;
}
/** Stable identity of the spot list: drives the engine reload invariant and the settings signature. */
export function spotSignature(spots:readonly HealSpot[]):string{
 return JSON.stringify(spots.map(s=>[s.x,s.y,s.r,s.dx,s.dy]));
}
/** Smooth coverage of the disc: fully opaque inside 70% of the radius, smoothstep feather to the edge. */
export function spotCoverage(dist:number):number{
 if(dist>=1)return 0;
 if(dist<=0.7)return 1;
 const u=(dist-0.7)/0.3;
 return 1-u*u*(3-2*u);
}
interface Frame{bytes:ArrayBuffer;width:number;height:number;}
/** Picks the flattest nearby disc as the clone source for a click at (x,y): eight directions at 2.2r, lowest sampled luma variance wins; null when every candidate leaves the frame. */
export function autoSource(frame:Frame,x:number,y:number,r:number):HealSpot|null{
 const {width:w,height:h}=frame,data=new Uint8ClampedArray(frame.bytes);
 const rp=r*Math.min(w,h),off=2.2*rp;
 let best:HealSpot|null=null,bestVar=Infinity;
 for(let k=0;k<8;k++){
  const a=k*Math.PI/4,sx=x*w+Math.cos(a)*off,sy=y*h+Math.sin(a)*off;
  if(sx-rp<0||sy-rp<0||sx+rp>w||sy+rp>h)continue;
  const stride=Math.max(1,Math.floor(rp/8));
  const x0=Math.round(sx-rp),x1=Math.round(sx+rp),y0=Math.round(sy-rp),y1=Math.round(sy+rp);
  let n=0,m=0,q=0;
  for(let py=y0;py<=y1;py+=stride)for(let px=x0;px<=x1;px+=stride){
   const ex=px-sx,ey=py-sy;if(ex*ex+ey*ey>rp*rp)continue;
   const i=(py*w+px)*4,l=0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2];
   n++;m+=l;q+=l*l;
  }
  if(n<4)continue;
  const v=q/n-(m/n)*(m/n);
  if(v<bestVar){bestVar=v;best={x,y,r,dx:(sx-x*w)/w,dy:(sy-y*h)/h};}
 }
 return best;
}
/** Returns the input unchanged when there is nothing to stamp; otherwise a fresh frame with every spot applied in order. */
export function applySpots(frame:Frame,spots:readonly HealSpot[]):Frame{
 if(spots.length===0)return frame;
 const{width:w,height:h}=frame;
 const src=new Uint8Array(frame.bytes);
 const out=new Uint8Array(src);
 const R=Math.min(w,h);
 for(const spot of spots){
  const cx=spot.x*w,cy=spot.y*h,rad=Math.max(1,spot.r*R);
  const sx=spot.dx*w,sy=spot.dy*h;
  const x0=Math.max(0,Math.floor(cx-rad)),x1=Math.min(w-1,Math.ceil(cx+rad));
  const y0=Math.max(0,Math.floor(cy-rad)),y1=Math.min(h-1,Math.ceil(cy+rad));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const cov=spotCoverage(Math.hypot(x-cx,y-cy)/rad);
   if(cov<=0)continue;
   const ox=Math.min(w-1,Math.max(0,Math.round(x+sx))),oy=Math.min(h-1,Math.max(0,Math.round(y+sy)));
   const di=(y*w+x)*4,si=(oy*w+ox)*4;
   for(let c=0;c<3;c++)out[di+c]=Math.round(src[si+c]*cov+out[di+c]*(1-cov));
   out[di+3]=Math.round(src[si+3]*cov+out[di+3]*(1-cov));
  }
 }
 return{bytes:out.buffer as ArrayBuffer,width:w,height:h};
}
