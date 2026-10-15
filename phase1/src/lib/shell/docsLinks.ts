/** Studio docs links (shell wave 2). Pure data + a fail-closed resolver. A manifest names a link id and a URL;
 *  the shell only opens it when the URL is https and its host is on SHELL_DOCS_HOSTS. Opening itself goes through the
 *  existing shell open command (no new native capability). No imports from store or components. */
export interface DocsLinkDef{
 id:string;
 /** https URL. Anything else is refused. */
 url:string;
 /** i18n key for the label (all five locales). */
 labelKey:string;
 /** `when` expression over StudioContext (when.ts). Default: always. */
 when?:string;
}
/** Explicit allowlist of hosts a docs link may point at. Exact host match (no subdomain wildcard). Extend deliberately. */
export const SHELL_DOCS_HOSTS:readonly string[]=Object.freeze(['github.com']);
/** Per-host path prefixes. The desktop `open_external` command only opens https://github.com/philppplik/somnia pages, so a link
 *  outside that prefix would pass here and then be refused natively. A host without an entry allows any path. */
export const SHELL_DOCS_PATHS:Readonly<Record<string,readonly string[]>>=Object.freeze({'github.com':Object.freeze(['/philppplik/somnia'])});
export type DocsLinkCheck={ok:true;url:string}|{ok:false;reason:'invalid-url'|'not-https'|'credentials'|'host-not-allowed'|'bad-port'|'path-not-allowed'};
export function checkDocsUrl(raw:unknown,hosts:readonly string[]=SHELL_DOCS_HOSTS,paths:Readonly<Record<string,readonly string[]>>=SHELL_DOCS_PATHS):DocsLinkCheck{
 if(typeof raw!=='string'||raw.length===0||raw.length>2048||/[\u0000-\u001f\u007f\s]/.test(raw))return{ok:false,reason:'invalid-url'};
 let u:URL;
 try{u=new URL(raw);}catch{return{ok:false,reason:'invalid-url'};}
 if(u.protocol!=='https:')return{ok:false,reason:'not-https'};
 if(u.username||u.password)return{ok:false,reason:'credentials'};
 if(u.port&&u.port!=='443')return{ok:false,reason:'bad-port'};
 if(!hosts.includes(u.hostname.toLowerCase()))return{ok:false,reason:'host-not-allowed'};
 const prefixes=paths[u.hostname.toLowerCase()];
 if(prefixes&&(/%2e|%2f|%5c/i.test(u.pathname)||!prefixes.some(x=>u.pathname===x||u.pathname.startsWith(x+'/'))))return{ok:false,reason:'path-not-allowed'};
 return{ok:true,url:u.toString()};
}
/** Links that pass the check, in declaration order; duplicates by id keep the first. Invalid entries are dropped, never thrown on. */
export function resolveDocsLinks(defs:readonly DocsLinkDef[]|undefined,hosts:readonly string[]=SHELL_DOCS_HOSTS,paths:Readonly<Record<string,readonly string[]>>=SHELL_DOCS_PATHS):readonly (DocsLinkDef&{url:string})[]{
 const seen=new Set<string>(),out:(DocsLinkDef&{url:string})[]=[];
 for(const d of defs??[]){
  if(!d||typeof d.id!=='string'||!d.id||seen.has(d.id))continue;
  const c=checkDocsUrl(d.url,hosts,paths);if(!c.ok)continue;
  seen.add(d.id);out.push({...d,url:c.url});
 }
 return out;
}
/** Problems for a manifest validator (check:ui-commands style): one string per refused entry. */
export function validateDocsLinks(defs:readonly DocsLinkDef[]|undefined,hosts:readonly string[]=SHELL_DOCS_HOSTS,paths:Readonly<Record<string,readonly string[]>>=SHELL_DOCS_PATHS):string[]{
 const errs:string[]=[],seen=new Set<string>();
 for(const d of defs??[]){
  if(seen.has(d.id))errs.push(`docs link "${d.id}": duplicate id`);seen.add(d.id);
  if(!d.labelKey)errs.push(`docs link "${d.id}": missing labelKey`);
  const c=checkDocsUrl(d.url,hosts,paths);if(!c.ok)errs.push(`docs link "${d.id}": ${c.reason}`);
 }
 return errs;
}
