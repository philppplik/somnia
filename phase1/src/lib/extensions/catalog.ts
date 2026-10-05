import {parsePackageZip} from './packageInstall';
import {validateManifest} from './manifest';
import {installExtension} from './registry';
import {API_VERSION,type ExtensionManifest,type Permission} from './types';

export const CATALOG_URL='https://raw.githubusercontent.com/philppplik/somnia/phase1-foundation/docs/extensions/catalog/index.json';
const MAX_INDEX=300_000,MAX_ZIP=2_000_000;
export interface CatalogEntry {id:string;name:string;version:string;author:string;description:string;repo:string;download:string;sha256:string;apiVersion:number;permissions:Permission[]}
export interface ReviewedPackage {entry:CatalogEntry;manifest:ExtensionManifest}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** Only public GitHub raw content, with no credentials, query, port or fragments. */
export function rawGithubURL(value:string):boolean{
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='raw.githubusercontent.com'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&/^\/[\w.-]+\/[\w.-]+\/[\w.-]+\/.+/.test(u.pathname);}catch{return false;}
}
export function validateCatalog(value:unknown):CatalogEntry[]{
 if(!record(value)||value.schemaVersion!==1||!Array.isArray(value.extensions)||value.extensions.length>200)throw new Error('Unsupported or invalid extension index.');
 const ids=new Set<string>();
 return value.extensions.map((item,i)=>{
  if(!record(item))throw new Error(`Invalid index entry ${i+1}.`);
  for(const [key,max] of [['id',100],['name',80],['version',20],['author',80],['description',400],['repo',300],['download',500]] as const){if(typeof item[key]!=='string'||!(item[key] as string).trim()||(item[key] as string).length>max)throw new Error(`Invalid ${key} in index entry ${i+1}.`);}
  const m=validateManifest({id:item.id,name:item.name,version:item.version,apiVersion:item.apiVersion,permissions:item.permissions});
  if(!m.ok)throw new Error(`Index entry ${i+1}: ${m.errors.join(' ')}`);
  if(ids.has(m.manifest.id))throw new Error('Duplicate extension id in index.');ids.add(m.manifest.id);
  if(!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(item.repo as string)||!rawGithubURL(item.download as string)||typeof item.sha256!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256))throw new Error(`Invalid GitHub URL or SHA-256 in index entry ${i+1}.`);
  return {...item,permissions:m.manifest.permissions} as unknown as CatalogEntry;
 });
}
async function fetchBytes(url:string,max:number,signal?:AbortSignal):Promise<Uint8Array>{
 if(!rawGithubURL(url))throw new Error('Only GitHub raw content URLs are allowed.');
 const deadline=AbortSignal.timeout(20_000);
 const boundedSignal=signal?AbortSignal.any([signal,deadline]):deadline;
 const response=await fetch(url,{signal:boundedSignal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store'});
 if(!response.ok)throw new Error(`GitHub download failed (${response.status}).`);
 const length=Number(response.headers.get('content-length'));if(length>max)throw new Error('Download is too large.');
 if(!response.body)throw new Error('Download body is unavailable.');
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw new Error('Download is too large.');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function fetchCatalog(signal?:AbortSignal):Promise<CatalogEntry[]>{
 const bytes=await fetchBytes(CATALOG_URL,MAX_INDEX,signal);let json:unknown;try{json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('Extension index is not valid JSON.');}return validateCatalog(json);
}
export async function reviewCatalogPackage(entry:CatalogEntry,signal?:AbortSignal):Promise<ReviewedPackage>{
 // Revalidate even when called outside the UI.
 const checked=validateCatalog({schemaVersion:1,extensions:[entry]})[0];
 const bytes=await fetchBytes(checked.download,MAX_ZIP,signal);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==checked.sha256)throw new Error('SHA-256 mismatch. Nothing was installed.');
 const result=parsePackageZip(bytes);if(!result.ok)throw new Error(result.errors.join(' '));
 const manifest=result.manifest;
 if(manifest.id!==checked.id||manifest.name!==checked.name||manifest.version!==checked.version||manifest.apiVersion!==API_VERSION||manifest.permissions.length!==checked.permissions.length||manifest.permissions.some(p=>!checked.permissions.includes(p)))throw new Error('Package identity or permissions do not match the index.');
 // Worker global removal is not a proven security boundary (ADR-003). Panels use opaque-origin iframes with no-network CSP.
 if(manifest.code||manifest.main)throw new Error('Catalog worker code is not supported yet. Only declarative extensions and sandboxed panels can be installed from GitHub.');
 return {entry:checked,manifest};
}
export function installReviewedPackage(review:ReviewedPackage){
 // Disable replacements before the registry emits its change event.
 if(review.manifest.code||review.manifest.main)return{ok:false as const,errors:['Catalog worker code is not supported yet.']};
 return installExtension(JSON.stringify(review.manifest),{disabled:true});
}
export const permissionExplanation:Record<Permission,string>={commands:'Add commands to menus and the command palette.', 'project.read':'Read files from the open project.', 'project.write':'Change the open project through undoable operations (no direct disk saving).',selection:'Read the selected element.', 'ui.notify':'Show editor notifications.',storage:'Store per-extension settings in this app profile.'};
