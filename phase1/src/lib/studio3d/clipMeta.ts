/** What a .glb/.gltf of this studio adds to an animation (its "extras"), so the clip length and the easing of the original keys survive a save. Other apps ignore it and still play the baked samples. */
import {isKeyPath,MAX_KEYS_PER_TRACK,MAX_CLIP_SECONDS,KEY_EPSILON,type KeyPath} from './clips';
import {isEase,type Ease} from './ease';
export const EXTRAS_KEY='somnia';
export const MAX_META_TRACKS=5000;
export interface MetaTrack{/** glTF node index */node:number;path:KeyPath;/** Times of the authoring keys, ascending */times:number[];ease:Ease[]}
export interface ClipMeta{duration?:number;tracks:MetaTrack[]}
export function buildExtras(meta:ClipMeta):Record<string,unknown>{
 return{[EXTRAS_KEY]:{v:1,...(meta.duration!==undefined?{duration:meta.duration}:{}),tracks:meta.tracks.map(t=>({node:t.node,path:t.path,times:t.times,ease:t.ease}))}};
}
/** Reads untrusted extras. Anything that does not fit is ignored, never an error: the clip still opens from its samples. */
export function parseExtras(raw:unknown):ClipMeta|undefined{
 if(!raw||typeof raw!=='object')return undefined;const x=(raw as Record<string,unknown>)[EXTRAS_KEY];
 if(!x||typeof x!=='object'||(x as {v?:unknown}).v!==1)return undefined;
 const d=(x as {duration?:unknown}).duration;const duration=typeof d==='number'&&Number.isFinite(d)&&d>0&&d<=MAX_CLIP_SECONDS?d:undefined;
 const tracks:MetaTrack[]=[];const list=(x as {tracks?:unknown}).tracks;
 if(Array.isArray(list))for(const t of list.slice(0,MAX_META_TRACKS)){
  if(!t||typeof t!=='object')continue;const r=t as Record<string,unknown>;
  if(typeof r.node!=='number'||!Number.isInteger(r.node)||r.node<0||!isKeyPath(r.path)||!Array.isArray(r.times)||!Array.isArray(r.ease))continue;
  if(r.times.length===0||r.times.length>MAX_KEYS_PER_TRACK||r.ease.length!==r.times.length)continue;
  if(!r.times.every((v,i)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=MAX_CLIP_SECONDS&&(i===0||v>(r.times as number[])[i-1]+KEY_EPSILON)))continue;
  if(!r.ease.every(isEase))continue;
  tracks.push({node:r.node,path:r.path,times:r.times as number[],ease:r.ease as Ease[]});
 }
 return{duration,tracks};
}
