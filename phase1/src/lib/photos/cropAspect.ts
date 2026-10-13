import type {PhotoCrop,PhotoSettings} from './studioSettings';
/** Aspect choices of the Geometry panel. `original` follows the oriented source frame; `free` leaves the rect alone. */
export type CropAspect='free'|'original'|'1:1'|'4:3'|'3:2'|'16:9'|'5:4'|'3:4'|'2:3'|'9:16';
export const CROP_ASPECTS:readonly CropAspect[]=['free','original','1:1','4:3','3:2','16:9','5:4','3:4','2:3','9:16'];
export const isCropAspect=(v:unknown):v is CropAspect=>typeof v==='string'&&(CROP_ASPECTS as readonly string[]).includes(v);
/** Source dimensions after the orientation transform (quarter turns swap width and height). */
export function orientedSize(width:number,height:number,orientation:PhotoSettings['orientation']){
 return orientation%2===1?{width:height,height:width}:{width,height};
}
/** Numeric width/height ratio, or null for `free`. */
export function aspectRatio(aspect:CropAspect,frameW:number,frameH:number):number|null{
 if(aspect==='free')return null;
 if(aspect==='original')return frameW>0&&frameH>0?frameW/frameH:null;
 const [a,b]=aspect.split(':').map(Number);return a/b;
}
const clamp01=(v:number)=>Math.min(1,Math.max(0,v));
/**
 * Largest rect of `ratio` that fits inside `base` (normalized rect of the oriented frame), centred on `base`.
 * Normalized units, so the pixel ratio uses the frame size: pixelW/pixelH = ratio.
 */
export function fitAspect(base:PhotoCrop,ratio:number,frameW:number,frameH:number):PhotoCrop{
 const bw=(base.x1-base.x0)*frameW,bh=(base.y1-base.y0)*frameH;
 if(!(bw>0&&bh>0&&ratio>0&&Number.isFinite(ratio)))return base;
 let w=bw,h=bw/ratio;if(h>bh){h=bh;w=bh*ratio;}
 const cx=(base.x0+base.x1)/2,cy=(base.y0+base.y1)/2,nw=w/frameW,nh=h/frameH;
 const x0=clamp01(cx-nw/2),y0=clamp01(cy-nh/2);
 return {x0,y0,x1:clamp01(x0+nw),y1:clamp01(y0+nh)};
}
/** Same rect turned a quarter (portrait to landscape and back), kept inside the frame. */
export function swapAspect(rect:PhotoCrop,frameW:number,frameH:number):PhotoCrop{
 const wPx=(rect.x1-rect.x0)*frameW,hPx=(rect.y1-rect.y0)*frameH;
 return fitCentered(rect,hPx,wPx,frameW,frameH);
}
function fitCentered(rect:PhotoCrop,wPx:number,hPx:number,frameW:number,frameH:number):PhotoCrop{
 const k=Math.min(1,frameW/wPx,frameH/hPx);const w=wPx*k/frameW,h=hPx*k/frameH;
 const cx=(rect.x0+rect.x1)/2,cy=(rect.y0+rect.y1)/2;
 const x0=Math.min(1-w,Math.max(0,cx-w/2)),y0=Math.min(1-h,Math.max(0,cy-h/2));
 return {x0,y0,x1:x0+w,y1:y0+h};
}
/** Output size in pixels of the current crop on the engine source frame. Straighten rotates inside the crop, so with it the size is an estimate. */
export function outputSize(sourceW:number,sourceH:number,s:Pick<PhotoSettings,'orientation'|'crop'|'straighten'>){
 const f=orientedSize(sourceW,sourceH,s.orientation);const c=s.crop??{x0:0,y0:0,x1:1,y1:1};
 return {width:Math.max(1,Math.round((c.x1-c.x0)*f.width)),height:Math.max(1,Math.round((c.y1-c.y0)*f.height)),estimated:s.straighten!==0};
}
/** Reduced ratio label for a pixel size, e.g. 1920x1080 gives "16:9". */
export function ratioLabel(w:number,h:number):string{
 if(!(w>0&&h>0))return '';const g=(a:number,b:number):number=>b?g(b,a%b):a;const d=g(Math.round(w),Math.round(h));
 const a=Math.round(w)/d,b=Math.round(h)/d;return a>40||b>40?(w/h).toFixed(2)+':1':`${a}:${b}`;
}
