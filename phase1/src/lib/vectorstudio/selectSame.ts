import type {VectorDoc} from '../vectorio';

export const SAME_MODES=['fill','stroke','both'] as const;
export type SameMode=(typeof SAME_MODES)[number];

const norm=(v:unknown)=>typeof v==='string'?v.trim().toLowerCase():'';

/** Ids of all visible, unlocked paths whose fill and/or stroke equals that of the first selected path. Selection-only, no history step. */
export function sameStyleIds(doc:VectorDoc,selection:readonly string[],mode:SameMode):string[]{
  if(!SAME_MODES.includes(mode))throw new RangeError('mode must be fill, stroke or both');
  const ref=doc.paths.find(p=>p.id===selection[0]);
  if(!ref)throw new Error('Select a path first');
  const f=norm(ref.style.fill),s=norm(ref.style.stroke);
  return doc.paths.filter(p=>!p.hidden&&!p.locked&&(mode==='stroke'||norm(p.style.fill)===f)&&(mode==='fill'||norm(p.style.stroke)===s)).map(p=>p.id);
}
