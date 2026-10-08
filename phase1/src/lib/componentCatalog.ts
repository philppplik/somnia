import type {Component} from './componentSystem';
import {variantOf} from './componentSystem';
/** Browse layer for the component library: tags, folders, search, previews. Pure functions, no DOM except where noted.
 *  Metadata lives in its own storage key and is keyed by component id, so the component data format is untouched. */
export interface Meta{tags:string[];folder:string}
export type MetaMap=Record<string,Meta>;
export const META_KEY='somnia.components.meta.v1';
export const META_LIMITS={tags:8,tag:24,folder:40} as const;
export const MIME_COMPONENT='application/x-somnia-component';
export interface Query{text:string;tag:string|null;folder:string|null}
export const emptyQuery:Query={text:'',tag:null,folder:null};
export const UNFILED='';

export function normalizeTag(raw:string):string{return raw.toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,META_LIMITS.tag);}
export function normalizeFolder(raw:string):string{const f=raw.replace(/\s+/g,' ').trim();if(f.length>META_LIMITS.folder)throw new Error(`Folder names have at most ${META_LIMITS.folder} characters.`);return f;}
export function metaOf(map:MetaMap,id:string):Meta{return map[id]??{tags:[],folder:UNFILED};}
export function parseMeta(raw:string|null|undefined):MetaMap{let x:unknown;try{x=JSON.parse(raw||'{}');}catch{return {};}if(!x||typeof x!=='object'||Array.isArray(x))return {};const out:MetaMap={};for(const [id,v] of Object.entries(x as Record<string,unknown>)){if(!v||typeof v!=='object')continue;const m=v as {tags?:unknown;folder?:unknown};const tags=Array.isArray(m.tags)?[...new Set(m.tags.filter((t):t is string=>typeof t==='string').map(normalizeTag).filter(Boolean))].slice(0,META_LIMITS.tags):[];let folder='';if(typeof m.folder==='string'){try{folder=normalizeFolder(m.folder);}catch{folder='';}}if(tags.length||folder)out[id]={tags,folder};}return out;}
/** Drop metadata of components that no longer exist. */
export function prune(map:MetaMap,lib:Component[]):MetaMap{const ids=new Set(lib.map(c=>c.id));return Object.fromEntries(Object.entries(map).filter(([id])=>ids.has(id)));}
export function setTags(map:MetaMap,id:string,rawTags:string[]):MetaMap{const tags=[...new Set(rawTags.map(normalizeTag).filter(Boolean))];if(tags.length>META_LIMITS.tags)throw new Error(`A component can have at most ${META_LIMITS.tags} tags.`);return put(map,id,{...metaOf(map,id),tags});}
export function addTag(map:MetaMap,id:string,raw:string):MetaMap{const t=normalizeTag(raw);if(!t)throw new Error('Tags use letters, numbers and dashes.');return setTags(map,id,[...metaOf(map,id).tags,t]);}
export function removeTag(map:MetaMap,id:string,tag:string):MetaMap{return setTags(map,id,metaOf(map,id).tags.filter(t=>t!==tag));}
export function setFolder(map:MetaMap,id:string,raw:string):MetaMap{return put(map,id,{...metaOf(map,id),folder:normalizeFolder(raw)});}
function put(map:MetaMap,id:string,m:Meta):MetaMap{const next={...map};if(!m.tags.length&&!m.folder)delete next[id];else next[id]=m;return next;}
export function tagCounts(lib:Component[],map:MetaMap):{tag:string;count:number}[]{const c=new Map<string,number>();for(const x of lib)for(const t of metaOf(map,x.id).tags)c.set(t,(c.get(t)??0)+1);return [...c].map(([tag,count])=>({tag,count})).sort((a,b)=>b.count-a.count||a.tag.localeCompare(b.tag));}
export function folderCounts(lib:Component[],map:MetaMap):{folder:string;count:number}[]{const c=new Map<string,number>();for(const x of lib){const f=metaOf(map,x.id).folder;c.set(f,(c.get(f)??0)+1);}return [...c].map(([folder,count])=>({folder,count})).sort((a,b)=>a.folder===UNFILED?1:b.folder===UNFILED?-1:a.folder.localeCompare(b.folder));}
/** Search is case-insensitive; every word must match name, a variant name, a tag or the folder. Name matches rank first. */
export interface SearchQuery extends Query{category?:string|null}
export function search(lib:Component[],map:MetaMap,q:SearchQuery):Component[]{const words=q.text.toLowerCase().split(/\s+/).filter(Boolean);const scored:{c:Component;score:number;i:number}[]=[];lib.forEach((c,i)=>{const m=metaOf(map,c.id);if(q.tag!==null&&!m.tags.includes(q.tag))return;if(q.folder!==null&&m.folder!==q.folder)return;if(q.category&&c.category!==q.category)return;const name=c.name.toLowerCase(),other=[...c.variants.map(v=>v.name),...m.tags,m.folder,c.category??''].join(' ').toLowerCase();let score=0;for(const w of words){if(name.startsWith(w))score+=3;else if(name.includes(w))score+=2;else if(other.includes(w))score+=1;else return;}scored.push({c,score,i});});return scored.sort((a,b)=>b.score-a.score||a.i-b.i).map(s=>s.c);}
/** Self-contained HTML for a thumbnail. Scripts, event handlers and external loads are removed; render it in an iframe with sandbox="". */
export function previewDoc(html:string,projectCss=''):string{const clean=html.replace(/<script\b[\s\S]*?<\/script\s*>/gi,'').replace(/<script\b[^>]*>/gi,'').replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'').replace(/(href|src|action|formaction)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi,'$1="#"');const css=projectCss.replace(/</g,'').replace(/@import[^;]*;/gi,'');return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:"><style>html,body{margin:0;padding:8px;background:#fff;overflow:hidden;pointer-events:none}${css}</style></head><body>${clean}</body></html>`;}
/** Concatenate the <style> blocks of the current page so thumbnails look like the page. */
export function extractStyles(pageHtml:string):string{const out:string[]=[];const re=/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;let m;while((m=re.exec(pageHtml)))out.push(m[1]);return out.join('\n').slice(0,200000);}
export function dragPayload(componentId:string,variantId:string):string{return `${componentId}:${variantId}`;}
export function parsePayload(raw:string|null|undefined):{componentId:string;variantId:string}|null{if(!raw)return null;const i=raw.indexOf(':');if(i<1||i===raw.length-1)return null;return {componentId:raw.slice(0,i),variantId:raw.slice(i+1)};}
export function defaultHtml(c:Component):string{return variantOf(c).html;}
