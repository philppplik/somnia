import type {VectorDocument,VectorPath} from '../vectorio';
/** Paths that are locked together with `id`: the path itself, its compound contours and its editor group. */
export function lockMembers(doc:VectorDocument,id:string):VectorPath[]{
 const t=doc.paths.find(p=>p.id===id);if(!t)throw Error('Unknown path: '+id);
 return doc.paths.filter(p=>p.id===id||(t.compound!==undefined&&p.compound===t.compound)||(t.group!==undefined&&p.group===t.group));
}
/** Locks (or, when every member is already locked, unlocks) an object. Locked paths cannot be selected, so no operation can change them. */
export function toggleLock(doc:VectorDocument,id:string):VectorDocument{
 if(!doc.paths.some(p=>p.id===id)&&(doc.texts??[]).some(t=>t.id===id))return {...doc,texts:(doc.texts??[]).map(t=>{if(t.id!==id)return t;const {locked:_l,...rest}=t;return t.locked?rest:{...rest,locked:true as const};})};
 const members=lockMembers(doc,id),ids=new Set(members.map(p=>p.id)),lock=!members.every(p=>p.locked);
 return {...doc,paths:doc.paths.map(p=>{if(!ids.has(p.id))return p;const {locked:_l,...rest}=p;return lock?{...rest,locked:true as const}:rest;})};
}
