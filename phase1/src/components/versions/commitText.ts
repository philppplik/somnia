import type {GitChange} from '../../lib/git/types';
export type Translate=(key:string,params?:Record<string,string|number>)=>string;
const base=(p:string)=>p.split('/').pop()||p;
/**
 * Suggested version name from the ticked changes. Deterministic, local, no model call.
 * One file: "Update index.html". Several: "Update 3 files: a.html, b.css, +1 more".
 */
export function suggestSubject(changes:readonly GitChange[],t:Translate):string{
 if(!changes.length)return '';
 const kinds=new Set(changes.map(c=>c.kind==='untracked'||c.kind==='copied'?'added':c.kind==='typechange'?'modified':c.kind));
 if(changes.length===1){const c=changes[0];
  if(c.kind==='renamed'&&c.oldPath)return clip(t('versions.suggest.rename',{from:base(c.oldPath),to:base(c.path)}));
  return clip(t(`versions.suggest.one.${kinds.has('added')?'added':kinds.has('deleted')?'deleted':'modified'}`,{file:base(c.path)}));}
 const only=kinds.size===1?[...kinds][0]:'mixed';
 const verb=only==='added'||only==='deleted'?only:'mixed';
 const names=changes.slice(0,2).map(c=>base(c.path)).join(', ');
 const more=changes.length-2;
 return clip(t(`versions.suggest.many.${verb}`,{count:changes.length,names,more:more>0?t('versions.suggest.more',{count:more}):''}).replace(/,\s*$/,'').replace(/\s+$/,''));}
/** Contract limit: 1-200 chars. */
export const clip=(s:string)=>s.length>200?s.slice(0,197)+'...':s;
export const validSubject=(s:string)=>{const n=s.trim().length;return n>=1&&n<=200;};
