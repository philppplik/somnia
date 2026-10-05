import type {CatalogEntry} from './catalog';
import type {ExtensionManifest, Permission} from './types';

/** Pure view logic for the extension catalog UI: categories, filters, update state. No I/O. */
export const CATEGORIES=['Themes','Editing','Productivity','Tools','Other'] as const;
export type Category=typeof CATEGORIES[number];
export type InstallState='not-installed'|'installed'|'update-available'|'newer-installed';
export type StatusFilter='all'|'not-installed'|'installed'|'update-available';
export interface CatalogFilter {query:string;category:Category|'all';status:StatusFilter;noPermissionsOnly:boolean}
export const DEFAULT_FILTER:CatalogFilter={query:'',category:'all',status:'all',noPermissionsOnly:false};

/** Optional `category` in the index entry wins. Missing or unknown values fall back to Other. */
export function categoryOf(entry:Pick<CatalogEntry,'permissions'>&{category?:unknown}):Category{
 if(typeof entry.category==='string'){const hit=CATEGORIES.find(c=>c.toLowerCase()===(entry.category as string).trim().toLowerCase());if(hit)return hit;}
 return 'Other';
}

/** Compare dotted numeric versions ("1.2.10" > "1.2.9"). Pre-release tags after "-" sort below the plain version. Returns null if unparsable. */
export function compareVersions(a:string,b:string):number|null{
 const parse=(v:string)=>{const m=/^v?(\d+(?:\.\d+)*)(?:-([\w.-]+))?$/.exec(v.trim());return m?{n:m[1].split('.').map(Number),pre:m[2]??''}:null;};
 const x=parse(a),y=parse(b);if(!x||!y)return null;
 for(let i=0;i<Math.max(x.n.length,y.n.length);i++){const d=(x.n[i]??0)-(y.n[i]??0);if(d)return d<0?-1:1;}
 if(x.pre===y.pre)return 0;if(!x.pre)return 1;if(!y.pre)return -1;return x.pre<y.pre?-1:1;
}

export function installStateOf(entry:Pick<CatalogEntry,'id'|'version'>,installed:Pick<ExtensionManifest,'id'|'version'>[]):{state:InstallState;installedVersion?:string}{
 const hit=installed.find(e=>e.id===entry.id);if(!hit)return{state:'not-installed'};
 const c=compareVersions(entry.version,hit.version);
 // Unparsable versions: treat any difference as an update so the user can still reinstall.
 if(c===null)return{state:entry.version===hit.version?'installed':'update-available',installedVersion:hit.version};
 return{state:c>0?'update-available':c<0?'newer-installed':'installed',installedVersion:hit.version};
}

export function filterEntries(entries:CatalogEntry[],installed:Pick<ExtensionManifest,'id'|'version'>[],f:CatalogFilter):CatalogEntry[]{
 const q=f.query.trim().toLowerCase();
 return entries.filter(e=>{
  if(q&&!`${e.name} ${e.author} ${e.description} ${e.id}`.toLowerCase().includes(q))return false;
  if(f.category!=='all'&&categoryOf(e)!==f.category)return false;
  if(f.noPermissionsOnly&&e.permissions.length>0)return false;
  const s=installStateOf(e,installed).state;
  if(f.status==='not-installed'&&s!=='not-installed')return false;
  if(f.status==='installed'&&s==='not-installed')return false;
  if(f.status==='update-available'&&s!=='update-available')return false;
  return true;
 }).sort((a,b)=>a.name.localeCompare(b.name));
}

/** Count entries per category for the chips. Always counts the full list so chips do not jump while typing. */
export function categoryCounts(entries:CatalogEntry[]):Record<Category,number>{
 const out=Object.fromEntries(CATEGORIES.map(c=>[c,0])) as Record<Category,number>;for(const e of entries)out[categoryOf(e)]++;return out;
}
export const updatesAvailable=(entries:CatalogEntry[],installed:Pick<ExtensionManifest,'id'|'version'>[])=>entries.filter(e=>installStateOf(e,installed).state==='update-available').length;

/** Plain-language message for a failed index or package fetch. Raw messages stay available as detail. */
export function describeCatalogError(message:string):{title:string;hint:string}{
 if(/\((403|429)\)/.test(message))return{title:'GitHub is limiting requests right now.',hint:'Wait a few minutes and try again.'};
 if(/\(404\)/.test(message))return{title:'The extension index was not found.',hint:'It may have moved. Update Somnia or try later.'};
 if(/\(5\d\d\)/.test(message))return{title:'GitHub is having trouble.',hint:'Try again in a moment.'};
 if(/abort|timeout|timed out/i.test(message))return{title:'The request took too long.',hint:'Check your connection and try again.'};
 if(/failed to fetch|network|load failed/i.test(message))return{title:'Could not reach GitHub.',hint:'Check your internet connection and try again.'};
 if(/SHA-256/.test(message))return{title:'The download did not match the index.',hint:'Nothing was installed. Do not retry until the index is fixed.'};
 return{title:'Something went wrong.',hint:'Try again. Local file installs still work.'};
}
export type {Permission};
