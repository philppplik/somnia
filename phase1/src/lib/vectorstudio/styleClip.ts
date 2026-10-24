import type {Style,VectorDocument} from '../vectorio';
import {selectedPaths} from './selectionClosure';
/** In-app style buffer ("Copy style" / "Paste style"). Memory only: it never touches the system clipboard. */
const KEYS=['fill','stroke','strokeWidth','fillOpacity','strokeOpacity','opacity','fillRule','lineCap','lineJoin','miterLimit','dashArray','dashOffset','blendMode','arrowStart','arrowEnd','blur','shadowDx','shadowDy','shadowBlur','shadowColor','shadowOpacity'] as const;
const MAX_DASH=64;
let buffer:Partial<Style>|null=null;
/** Style of the topmost selected painted object, restricted to known keys (clip masks are not painted and are skipped). */
export function pickStyle(doc:VectorDocument,ids:readonly string[]):Partial<Style>|null{
 const list=selectedPaths(doc,ids).filter(p=>!p.clip);if(!list.length)return null;
 const src=list[list.length-1].style as Record<string,unknown>,out:Record<string,unknown>={};
 for(const k of KEYS){const v=src[k];if(v===undefined)continue;
  if(k==='dashArray'){if(Array.isArray(v)&&v.length<=MAX_DASH&&v.every(n=>typeof n==='number'&&Number.isFinite(n)))out[k]=[...v];}
  else if(typeof v==='number'){if(Number.isFinite(v))out[k]=v;}
  else if(typeof v==='string')out[k]=v;}
 return out as Partial<Style>;
}
export function copyStyle(doc:VectorDocument,ids:readonly string[]):boolean{const s=pickStyle(doc,ids);if(!s)return false;buffer=s;return true;}
export const hasStyleBuffer=()=>buffer!==null;
export const bufferedStyle=():Partial<Style>|null=>buffer?structuredClone(buffer):null;
export function clearStyleBuffer(){buffer=null;}
