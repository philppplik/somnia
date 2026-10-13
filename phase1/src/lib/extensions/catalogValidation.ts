/** Shared catalog entry schema. No fetch, storage or install orchestration dependencies. */
import {validateManifest} from './manifest';
import type {Permission} from './types';

export interface CatalogEntry {id:string;name:string;version:string;author:string;description:string;repo:string;download:string;sha256:string;apiVersion:number;permissions:Permission[];category?:string;/** True only when a maintainer reviewed this entry. Missing means false. A matching SHA-256 never sets it. */reviewed?:boolean;reviewedBy?:string}
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
  if(item.category!==undefined&&(typeof item.category!=='string'||item.category.length>30))throw new Error(`Invalid category in index entry ${i+1}.`);
  if(item.reviewed!==undefined&&typeof item.reviewed!=='boolean')throw new Error(`Invalid reviewed flag in index entry ${i+1}.`);
  if(item.reviewedBy!==undefined&&(typeof item.reviewedBy!=='string'||!item.reviewedBy.trim()||item.reviewedBy.length>80||item.reviewed!==true))throw new Error(`Invalid reviewedBy in index entry ${i+1}.`);
  const m=validateManifest({id:item.id,name:item.name,version:item.version,apiVersion:item.apiVersion,permissions:item.permissions});
  if(!m.ok)throw new Error(`Index entry ${i+1}: ${m.errors.join(' ')}`);
  if(ids.has(m.manifest.id))throw new Error('Duplicate extension id in index.');ids.add(m.manifest.id);
  if(!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(item.repo as string)||!rawGithubURL(item.download as string)||typeof item.sha256!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256))throw new Error(`Invalid GitHub URL or SHA-256 in index entry ${i+1}.`);
  return {...item,reviewed:item.reviewed===true,permissions:m.manifest.permissions} as unknown as CatalogEntry;
 });
}
