import type {GitChange,GitChangeKind} from '../../lib/git/types';
/** Changes the user can tick. Conflicted files and ignored files are listed or hidden, never committed from here. */
export const isSelectable=(c:GitChange)=>c.kind!=='conflicted'&&c.kind!=='ignored';
export const isVisible=(c:GitChange)=>c.kind!=='ignored';
/** Default ticks: everything selectable except files suggested to skip (.DS_Store, Thumbs.db). */
export function defaultSelection(changes:readonly GitChange[]):Set<string>{return new Set(changes.filter(c=>isSelectable(c)&&!c.suggestSkip).map(c=>c.path));}
/** Keep the user's ticks across a refresh; new files follow the default rule, vanished files drop out. */
export function reconcileSelection(prev:ReadonlySet<string>,before:readonly GitChange[],after:readonly GitChange[]):Set<string>{
 const known=new Set(before.map(c=>c.path));const out=new Set<string>();
 for(const c of after){if(!isSelectable(c))continue;if(known.has(c.path)?prev.has(c.path):!c.suggestSkip)out.add(c.path);}
 return out;}
const KIND_KEY:Record<GitChangeKind,string>={added:'versions.kind.added',untracked:'versions.kind.added',modified:'versions.kind.modified',deleted:'versions.kind.deleted',renamed:'versions.kind.renamed',copied:'versions.kind.added',typechange:'versions.kind.modified',conflicted:'versions.kind.conflicted',ignored:'versions.kind.modified'};
/** Plain-language label key for a change; the Git kind stays available for the Advanced view. */
export const kindKey=(k:GitChangeKind)=>KIND_KEY[k];
/** One-letter glyph so state never depends on colour alone. */
export const kindGlyph=(k:GitChangeKind)=>({added:'+',untracked:'+',copied:'+',modified:'~',typechange:'~',deleted:'-',renamed:'>',conflicted:'!',ignored:'.'} as const)[k];
