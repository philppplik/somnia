import type {CatalogEntry} from './catalog';
import type {Permission} from './types';

/** Pure helpers behind the extension browser UX (search ranking, risk labels, install state). See docs/extensions/ux/MARKETPLACE-UX.md. */
export type Risk='none'|'low'|'medium';
const RISK:Record<Permission,Risk>={commands:'low',selection:'low','ui.notify':'low',storage:'low','project.read':'medium','project.write':'medium'};
const ORDER:Risk[]=['none','low','medium'];

export function permissionRisk(permissions:readonly Permission[]):Risk{
 let top=0;for(const p of permissions)top=Math.max(top,ORDER.indexOf(RISK[p]??'medium'));return ORDER[top];
}
export const riskLabel:Record<Risk,string>={none:'No permissions',low:'Low access',medium:'Touches your project'};

/** Compare dotted numeric versions. Returns -1, 0 or 1. Non-numeric parts count as 0. */
export function compareVersions(a:string,b:string):number{
 const pa=a.split('.').map(n=>parseInt(n,10)||0),pb=b.split('.').map(n=>parseInt(n,10)||0);
 for(let i=0;i<Math.max(pa.length,pb.length);i++){const d=(pa[i]??0)-(pb[i]??0);if(d)return d<0?-1:1;}return 0;
}
export type InstallState='available'|'installed'|'update';
export function installState(entry:Pick<CatalogEntry,'version'>,installedVersion?:string):InstallState{
 if(!installedVersion)return'available';return compareVersions(installedVersion,entry.version)<0?'update':'installed';
}

/** Score 0 = no match. Every search word must match somewhere. Name hits rank above author, author above description. */
export function matchScore(entry:Pick<CatalogEntry,'name'|'author'|'description'|'id'>,query:string):number{
 const words=query.toLowerCase().split(/\s+/).filter(Boolean);if(!words.length)return 1;
 const name=entry.name.toLowerCase(),id=entry.id.toLowerCase(),author=entry.author.toLowerCase(),desc=entry.description.toLowerCase();
 let total=0;
 for(const w of words){
  let s=0;
  if(name===w)s=100;else if(name.startsWith(w))s=60;else if(name.includes(w)||id.includes(w))s=40;
  else if(author.includes(w))s=20;else if(desc.includes(w))s=10;
  if(!s)return 0;total+=s;
 }
 return total;
}
export type SortKey='relevance'|'name'|'safest';
export function filterAndSort<T extends CatalogEntry>(entries:readonly T[],query:string,sort:SortKey):T[]{
 const scored=entries.map(e=>({e,s:matchScore(e,query)})).filter(x=>x.s>0);
 const byName=(a:T,b:T)=>a.name.localeCompare(b.name);
 if(sort==='name')scored.sort((a,b)=>byName(a.e,b.e));
 else if(sort==='safest')scored.sort((a,b)=>ORDER.indexOf(permissionRisk(a.e.permissions))-ORDER.indexOf(permissionRisk(b.e.permissions))||byName(a.e,b.e));
 else scored.sort((a,b)=>b.s-a.s||byName(a.e,b.e));
 return scored.map(x=>x.e);
}
