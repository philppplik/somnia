import type {Layer} from './model';
/** Export check: things in the composition that would surprise the user in the exported file. Pure; the caller supplies the layer box. */
export type PreflightCode='asset'|'offscreen'|'inactive'|'hidden'|'audio';
export interface PreflightIssue{code:PreflightCode;severity:'error'|'warn'|'info';layers:string[]}
export interface Box{x0:number;y0:number;x1:number;y1:number}
export const MAX_PREFLIGHT_LAYERS=8;
export interface PreflightInput{layers:readonly Layer[];assetIds:ReadonlySet<string>;range:{in:number;out:number};frame:{x:number;y:number;width:number;height:number};
 /** Boxes of the layer in composition pixels at the sampled ticks (empty when the size is unknown). */
 boxes:(l:Layer)=>readonly Box[]}
const hits=(b:Box,f:PreflightInput['frame'])=>b.x1>f.x&&b.x0<f.x+f.width&&b.y1>f.y&&b.y0<f.y+f.height;
export function preflight(i:PreflightInput):PreflightIssue[]{
 const out:PreflightIssue[]=[],add=(code:PreflightCode,severity:PreflightIssue['severity'],ls:Layer[])=>{if(ls.length)out.push({code,severity,layers:ls.slice(0,MAX_PREFLIGHT_LAYERS).map(l=>l.name)});};
 const shown=i.layers.filter(l=>l.visible&&l.kind!=='null'),active=shown.filter(l=>l.kind!=='audio'&&l.inT<i.range.out&&l.outT>i.range.in);
 add('asset','error',active.filter(l=>l.kind==='raster'&&!(l.source.assetId&&i.assetIds.has(l.source.assetId))));
 add('offscreen','warn',active.filter(l=>{const b=i.boxes(l);return b.length>0&&!b.some(x=>hits(x,i.frame));}));
 add('inactive','info',shown.filter(l=>l.kind!=='audio'&&!(l.inT<i.range.out&&l.outT>i.range.in)));
 add('hidden','info',i.layers.filter(l=>!l.visible&&l.kind!=='audio'&&l.kind!=='null'));
 add('audio','info',i.layers.filter(l=>l.kind==='audio'&&l.visible));
 return out;
}
