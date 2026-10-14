/** Keyframe data helpers for the clip editor. Pure arrays, no three.js, so the rules run under tsx --test. */
export const KEY_PATHS=['position','rotation','scale'] as const;
export type KeyPath=typeof KEY_PATHS[number];
export const KEY_STRIDE:Record<KeyPath,number>={position:3,rotation:4,scale:3};
/** Property name used in a track name for each path. Rotation is a quaternion in glTF. */
export const KEY_PROPERTY:Record<KeyPath,string>={position:'position',rotation:'quaternion',scale:'scale'};
export const MAX_CLIPS=64;
export const MAX_KEYS_PER_TRACK=2000;
export const MAX_CLIP_SECONDS=3600;
export const DEFAULT_CLIP_SECONDS=2;
export const KEY_EPSILON=0.0005;
export class ClipError extends Error{constructor(m:string){super(m);this.name='ClipError';}}
export const isKeyPath=(v:unknown):v is KeyPath=>typeof v==='string'&&(KEY_PATHS as readonly string[]).includes(v);
/** Keys sit on a millisecond grid so two keys never differ by float noise. */
export const snapKeyTime=(t:number):number=>Math.round(t*1000)/1000;
export function checkKeyTime(t:unknown):number{
 if(typeof t!=='number'||!Number.isFinite(t)||t<0||t>MAX_CLIP_SECONDS)throw new ClipError(`Time must be a number from 0 to ${MAX_CLIP_SECONDS} seconds.`);return snapKeyTime(t);
}
export function checkDuration(d:unknown):number{
 if(typeof d!=='number'||!Number.isFinite(d)||d<=0||d>MAX_CLIP_SECONDS)throw new ClipError(`Duration must be above 0 and at most ${MAX_CLIP_SECONDS} seconds.`);return snapKeyTime(d);
}
export function checkClipName(name:unknown):string{
 if(typeof name!=='string')throw new ClipError('The clip name must be text.');
 const n=name.trim().replace(/\s+/g,' ');if(!n||n.length>80)throw new ClipError('The clip name must be 1 to 80 characters.');return n;
}
export const trackName=(nodeKey:string,path:KeyPath):string=>`${nodeKey}.${KEY_PROPERTY[path]}`;
/** Reads `<node>.<property>` back. Returns null for anything else (morph targets, bones, nested names). */
export function parseTrackName(name:string):{node:string;path:KeyPath}|null{
 const i=name.lastIndexOf('.');if(i<=0)return null;const node=name.slice(0,i),prop=name.slice(i+1);
 if(/[.\[\]:\/]/.test(node))return null;
 const path=KEY_PATHS.find(p=>KEY_PROPERTY[p]===prop);return path?{node,path}:null;
}
/** Index of the key at time t, or -1. */
export function findKey(times:ArrayLike<number>,t:number):number{for(let i=0;i<times.length;i++)if(Math.abs(times[i]-t)<KEY_EPSILON)return i;return -1;}
/** True when values hold exactly one value per time. Cubic spline tracks hold three, so they cannot be edited key by key. */
export const isPlainTrack=(times:ArrayLike<number>,values:ArrayLike<number>,path:KeyPath):boolean=>times.length>0&&values.length===times.length*KEY_STRIDE[path];
/** Adds a key, or replaces the value of an existing key at the same time. Times stay sorted. Returns new arrays. */
export function insertKey(times:ArrayLike<number>,values:ArrayLike<number>,path:KeyPath,t:number,value:ArrayLike<number>):{times:number[];values:number[];replaced:boolean}{
 const s=KEY_STRIDE[path];if(value.length!==s||![...(value as number[])].every(Number.isFinite))throw new ClipError(`A ${path} key needs ${s} finite numbers.`);
 const ts=Array.from(times),vs=Array.from(values);const i=findKey(ts,t);
 if(i>=0){for(let k=0;k<s;k++)vs[i*s+k]=value[k];return{times:ts,values:vs,replaced:true};}
 if(ts.length>=MAX_KEYS_PER_TRACK)throw new ClipError(`A track can have at most ${MAX_KEYS_PER_TRACK} keys.`);
 let at=ts.findIndex(x=>x>t);if(at<0)at=ts.length;
 ts.splice(at,0,t);vs.splice(at*s,0,...Array.from(value));return{times:ts,values:vs,replaced:false};
}
export function removeKey(times:ArrayLike<number>,values:ArrayLike<number>,path:KeyPath,index:number):{times:number[];values:number[]}{
 const s=KEY_STRIDE[path];if(!Number.isInteger(index)||index<0||index>=times.length)throw new ClipError('There is no key at that time.');
 const ts=Array.from(times),vs=Array.from(values);ts.splice(index,1);vs.splice(index*s,s);return{times:ts,values:vs};
}
export const lastKeyTime=(times:ArrayLike<number>):number=>times.length?times[times.length-1]:0;
