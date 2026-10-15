import type {Layer} from './model';
/** Export check: things in the composition that would surprise the user in the exported file. Pure; the caller supplies the layer box. */
export type PreflightCode='asset'|'offscreen'|'inactive'|'hidden'|'audio'|'invisible'|'seam'|'flash'|'shrunk'|'empty';
export interface PreflightIssue{code:PreflightCode;severity:'error'|'warn'|'info';layers:string[]}
export interface Box{x0:number;y0:number;x1:number;y1:number}
export const MAX_PREFLIGHT_LAYERS=8;
export interface PreflightInput{layers:readonly Layer[];assetIds:ReadonlySet<string>;range:{in:number;out:number};frame:{x:number;y:number;width:number;height:number};
 /** Boxes of the layer in composition pixels at the sampled ticks (empty when the size is unknown). */
 boxes:(l:Layer)=>readonly Box[];
 /** Opacity (percent) at each sampled tick, and the pose (position, scale, rotation, opacity) on the first and last sampled tick. Absent: those two checks are skipped. */
 look?:(l:Layer)=>{opacity:readonly number[];first:readonly number[];last:readonly number[]};
 /** The user asked for a seamless loop (the last frame is dropped when it equals the first). */
 seamless?:boolean;
 /** Opacity (percent) at every frame of the range, and the frames per second. Absent: the flash check is skipped. */
 /** Smallest absolute scale component (percent) at each sampled tick. Absent: the shrunk check is skipped. */
 scales?:(l:Layer)=>readonly number[];
 frames?:(l:Layer)=>{opacity:readonly number[];perSecond:number}}
/** WCAG-style flash limit: more than 3 flashes (6 hard opacity jumps) inside one second. */
export const FLASH_JUMP=40,MAX_FLASH_JUMPS=6;
export function flashes(o:readonly number[],perSecond:number):boolean{
 if(!(perSecond>=6))return false;const w=Math.ceil(perSecond),jumps=o.slice(1).map((v,i)=>Math.abs(v-o[i])>=FLASH_JUMP?1:0);
 let sum=0;for(let i=0;i<jumps.length;i++){sum+=jumps[i];if(i>=w)sum-=jumps[i-w];if(sum>MAX_FLASH_JUMPS)return true;}return false;
}
const hits=(b:Box,f:PreflightInput['frame'])=>b.x1>f.x&&b.x0<f.x+f.width&&b.y1>f.y&&b.y0<f.y+f.height;
export function preflight(i:PreflightInput):PreflightIssue[]{
 const out:PreflightIssue[]=[],add=(code:PreflightCode,severity:PreflightIssue['severity'],ls:Layer[])=>{if(ls.length)out.push({code,severity,layers:ls.slice(0,MAX_PREFLIGHT_LAYERS).map(l=>l.name)});};
 const shown=i.layers.filter(l=>l.visible&&l.kind!=='null'),active=shown.filter(l=>l.kind!=='audio'&&l.inT<i.range.out&&l.outT>i.range.in);
 add('asset','error',active.filter(l=>l.kind==='raster'&&!(l.source.assetId&&i.assetIds.has(l.source.assetId))));
 add('offscreen','warn',active.filter(l=>{const b=i.boxes(l);return b.length>0&&!b.some(x=>hits(x,i.frame));}));
 if(i.look)add('invisible','warn',active.filter(l=>{const o=i.look!(l).opacity;return o.length>0&&o.every(v=>v<=0);}));
 if(i.frames)add('flash','warn',active.filter(l=>{const f=i.frames!(l);return flashes(f.opacity,f.perSecond);}));
 if(i.scales)add('shrunk','warn',active.filter(l=>{const o=i.scales!(l);return o.length>0&&o.every(v=>v<=0);}));
 add('empty','warn',active.filter(l=>l.kind==='text'&&!(l.source.text??'').trim()));
 if(i.look&&i.seamless)add('seam','info',active.filter(l=>{const k=i.look!(l);return k.first.length>0&&k.first.some((v,j)=>Math.abs(v-k.last[j])>0.5);}));
 add('inactive','info',shown.filter(l=>l.kind!=='audio'&&!(l.inT<i.range.out&&l.outT>i.range.in)));
 add('hidden','info',i.layers.filter(l=>!l.visible&&l.kind!=='audio'&&l.kind!=='null'));
 add('audio','info',i.layers.filter(l=>l.kind==='audio'&&l.visible));
 return out;
}
