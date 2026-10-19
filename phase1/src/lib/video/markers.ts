/**
 * Timeline markers for the Video studio: named points on the timeline (cue notes, cut ideas, review comments).
 * They are not part of the render. Saved in the project file and undoable with the edit list. Pure model.
 */
export interface TimelineMarker{id:string;at:number;label:string}
export const MAX_MARKERS=200,MAX_MARKER_LABEL=60;
const r3=(v:number)=>Math.round(v*1000)/1000;
let seq=0;
export const newMarkerId=()=>`mk-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const cleanLabel=(v:unknown)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,MAX_MARKER_LABEL):'';
/** Valid markers only: finite time >= 0 (clamped to `duration` when given), unique ids, cleaned labels, sorted by time, capped. */
export function sanitizeMarkers(list:readonly Partial<TimelineMarker>[]|undefined,duration?:number):TimelineMarker[]{
 if(!Array.isArray(list))return [];
 const seen=new Set<string>(),out:TimelineMarker[]=[];
 for(const m of list){
  if(!m||typeof m.id!=='string'||!m.id||seen.has(m.id)||typeof m.at!=='number'||!Number.isFinite(m.at))continue;
  seen.add(m.id);
  const at=r3(Math.max(0,duration!==undefined&&Number.isFinite(duration)?Math.min(m.at,Math.max(0,duration)):m.at));
  out.push({id:m.id,at,label:cleanLabel(m.label)});
  if(out.length>=MAX_MARKERS)break;
 }
 return out.sort((a,b)=>a.at-b.at||(a.id<b.id?-1:1));
}
export function addMarker(list:readonly TimelineMarker[],at:number,label=''):TimelineMarker[]{
 if(!Number.isFinite(at))throw new RangeError('Marker time must be a number');
 if(list.length>=MAX_MARKERS)throw new RangeError(`At most ${MAX_MARKERS} markers`);
 return sanitizeMarkers([...list,{id:newMarkerId(),at,label}]);
}
export const removeMarker=(list:readonly TimelineMarker[],id:string)=>list.filter(m=>m.id!==id);
export const renameMarker=(list:readonly TimelineMarker[],id:string,label:string)=>sanitizeMarkers(list.map(m=>m.id===id?{...m,label}:m));
export const moveMarker=(list:readonly TimelineMarker[],id:string,at:number)=>sanitizeMarkers(list.map(m=>m.id===id?{...m,at}:m));
/** Next marker strictly after `t` (with a small tolerance), or null. */
export const nextMarker=(list:readonly TimelineMarker[],t:number)=>list.find(m=>m.at>t+0.001)??null;
export const prevMarker=(list:readonly TimelineMarker[],t:number)=>[...list].reverse().find(m=>m.at<t-0.001)??null;
