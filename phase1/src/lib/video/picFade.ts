/**
 * Picture fade to and from black on a clip (media, image and freeze clips), in timeline seconds. Separate from the
 * audio fades (`fadeIn`/`fadeOut`) and from the crossfade into the next clip. Pure: shared by preview and export.
 */
export const MAX_PIC_FADE=30;
export interface PicFade{in:number;out:number}
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.min(MAX_PIC_FADE,v)):0;
const r3=(v:number)=>Math.round(v*1000)/1000;
/** The clip's picture fades, clamped, rounded to milliseconds and shrunk together so they never overlap inside `duration`. */
export function picFadeOf(c:{picFadeIn?:number;picFadeOut?:number}|null|undefined,duration:number):PicFade{
 let a=r3(num(c?.picFadeIn)),b=r3(num(c?.picFadeOut));
 const d=Math.max(0,Number.isFinite(duration)?duration:0);
 if(a+b>d&&a+b>0){const k=d/(a+b);a=r3(a*k);b=r3(b*k);}
 return {in:a,out:b};
}
export const hasPicFade=(c:{picFadeIn?:number;picFadeOut?:number}|null|undefined)=>num(c?.picFadeIn)>0||num(c?.picFadeOut)>0;
/** Brightness multiplier (0 black .. 1 untouched) at clip-local time `local`. Linear ramps. */
export function picFadeLevel(f:PicFade,duration:number,local:number):number{
 let v=1;
 if(f.in>0&&local<f.in)v=Math.min(v,Math.max(0,local/f.in));
 if(f.out>0&&local>duration-f.out)v=Math.min(v,Math.max(0,(duration-local)/f.out));
 return Math.min(1,Math.max(0,v));
}
