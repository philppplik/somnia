import type {Guides} from './types';
export const GUIDE_LIMIT=100;
const r3=(v:number)=>Math.round(v*1000)/1000;
const clean=(a:readonly number[]|undefined):number[]=>[...new Set((a??[]).filter(v=>Number.isFinite(v)&&Math.abs(v)<=1e6).map(r3))].sort((p,q)=>p-q);
/** Sorted, de-duplicated, bounded guides; undefined when there are none. */
export function normalizeGuides(g:Guides|undefined):Guides|undefined{
 if(!g)return undefined;const x=clean(g.x),y=clean(g.y);
 if(x.length+y.length===0)return undefined;
 const room=Math.max(0,GUIDE_LIMIT-x.length);return {x:x.slice(0,GUIDE_LIMIT),y:y.slice(0,room)};
}
const fmt=(a:readonly number[])=>a.join(',');
/** `data-vs-guides` value, e.g. `x:10,50;y:20`. */
export const formatGuides=(g:Guides)=>`x:${fmt(g.x)};y:${fmt(g.y)}`;
/** Strict parse; null when the value is malformed (the caller reports it and ignores guides). */
export function parseGuides(s:string):Guides|null{
 if(s.length>4000)return null;
 const m=/^x:([-0-9.,e]*);y:([-0-9.,e]*)$/.exec(s.trim());if(!m)return null;
 const nums=(t:string)=>t===''?[]:t.split(',').map(Number);const x=nums(m[1]),y=nums(m[2]);
 if(![...x,...y].every(Number.isFinite))return null;
 return normalizeGuides({x,y})??{x:[],y:[]};
}
