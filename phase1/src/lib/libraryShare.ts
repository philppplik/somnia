/**
 * Component library sharing, pure logic (no DOM, no storage, no store). Safe to unit test in Node.
 * Covers: JSON export/import format, the project-level library file, and merge conflict handling.
 * Built on componentSystem.ts. Storage and UI wiring live in libraryShareActions.ts.
 */
import {LIMITS,stripMarks,variantOf,type Component,type Variant} from './componentSystem';

export const FORMAT='somnia-component-library';
export const FORMAT_VERSION=1;
/** Where the library lives inside a project folder. */
export const PROJECT_LIBRARY_PATH='somnia-components.json';
/** Import files larger than this are refused before parsing. */
export const MAX_IMPORT_BYTES=4_000_000;

export interface LibraryFile{format:typeof FORMAT;version:number;exportedAt:string;components:Component[]}
export interface ParsedImport{components:Component[];warnings:string[]}

const same=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();
const isStr=(x:unknown):x is string=>typeof x==='string';

/** Serialize a library as pretty JSON. Marker attributes are removed so shared files stay clean. */
export function exportLibrary(list:Component[],now:()=>string=()=>new Date().toISOString()):string{
 const components=list.map(c=>({id:c.id,name:c.name,defaultVariantId:c.defaultVariantId,variants:c.variants.map(v=>({id:v.id,name:v.name,html:stripMarks(v.html)}))}));
 const file:LibraryFile={format:FORMAT,version:FORMAT_VERSION,exportedAt:now(),components};
 return JSON.stringify(file,null,2)+'\n';
}

/** Suggested download name, for example "somnia-components-2026-10-05.json". */
export const exportFileName=(now:Date=new Date())=>`somnia-components-${now.toISOString().slice(0,10)}.json`;

/**
 * Read a library file defensively. Throws plain-language errors for files that are not a Somnia library
 * (wrong format, newer version, too big, broken JSON). Bad single entries are skipped and reported in `warnings`.
 */
export function parseImport(raw:string):ParsedImport{
 if(!isStr(raw)||!raw.trim())throw new Error('The file is empty.');
 if(raw.length>MAX_IMPORT_BYTES)throw new Error('The file is larger than 4 MB. It is not a component library.');
 let x:any;try{x=JSON.parse(raw);}catch{throw new Error('The file is not valid JSON.');}
 if(!x||typeof x!=='object'||Array.isArray(x)||x.format!==FORMAT)throw new Error('This is not a Somnia component library file.');
 if(typeof x.version!=='number'||!Number.isInteger(x.version)||x.version<1)throw new Error('The library file has no valid version.');
 if(x.version>FORMAT_VERSION)throw new Error(`This library was made by a newer Somnia (format version ${x.version}). Update Somnia to import it.`);
 if(!Array.isArray(x.components))throw new Error('The library file has no component list.');
 const warnings:string[]=[];const out:Component[]=[];const ids=new Set<string>();
 x.components.forEach((c:any,i:number)=>{
  const label=isStr(c?.name)&&c.name.trim()?`"${c.name.trim()}"`:`entry ${i+1}`;
  if(!c||!isStr(c.id)||!c.id||!isStr(c.name)||!c.name.trim()||c.name.trim().length>LIMITS.name||!Array.isArray(c.variants)){warnings.push(`Skipped ${label}: missing or invalid id, name or variants.`);return;}
  if(ids.has(c.id)||out.some(o=>same(o.name,c.name))){warnings.push(`Skipped ${label}: duplicate of an earlier entry in the same file.`);return;}
  const variants:Variant[]=[];const vids=new Set<string>();
  for(const v of c.variants){
   if(!v||!isStr(v.id)||!v.id||!isStr(v.name)||!v.name.trim()||v.name.trim().length>LIMITS.name||!isStr(v.html)||!v.html.trim()){warnings.push(`${label}: skipped a variant with missing or invalid data.`);continue;}
   if(v.html.length>LIMITS.html){warnings.push(`${label}: skipped variant "${v.name.trim()}" (over the 100 KB limit).`);continue;}
   if(vids.has(v.id)||variants.some(o=>same(o.name,v.name))){warnings.push(`${label}: skipped a repeated variant "${v.name.trim()}".`);continue;}
   if(variants.length>=LIMITS.variants){warnings.push(`${label}: kept the first ${LIMITS.variants} variants, skipped the rest.`);break;}
   vids.add(v.id);variants.push({id:v.id,name:v.name.trim(),html:stripMarks(v.html)});
  }
  if(!variants.length){warnings.push(`Skipped ${label}: no usable variants.`);return;}
  ids.add(c.id);
  out.push({id:c.id,name:c.name.trim(),variants,defaultVariantId:variants.some(v=>v.id===c.defaultVariantId)?c.defaultVariantId:variants[0].id});
 });
 if(out.length>LIMITS.components){warnings.push(`The file has ${out.length} components. Only the first ${LIMITS.components} are read.`);out.length=LIMITS.components;}
 return {components:out,warnings};
}

/** Pick the better of two libraries when a project file and the personal profile both exist: none, the project wins. */
export const projectFirst=(project:Component[]|null,profile:Component[])=>project&&project.length?project:profile;

/** Parse the project library file text. Missing or empty file means no project library (null). Broken files throw. */
export function readProjectLibrary(files:Readonly<Record<string,string>>):ParsedImport|null{
 const t=files[PROJECT_LIBRARY_PATH];if(t===undefined||!t.trim())return null;return parseImport(t);
}

// ---------- merge ----------
export type Resolution='skip'|'replace'|'keep-both'|'merge-variants';
export type ItemStatus='new'|'identical'|'conflict';
export interface MergeItem{incoming:Component;status:ItemStatus;/** existing component with the same name */match?:Component}
const sig=(c:Component)=>JSON.stringify(c.variants.map(v=>[v.name.toLowerCase(),v.html]).sort());

/** Compare an import with the current library. Conflicts are components whose name already exists (case-insensitive). */
export function planMerge(existing:Component[],incoming:Component[]):MergeItem[]{
 return incoming.map(c=>{
  const match=existing.find(e=>same(e.name,c.name));
  if(!match)return {incoming:c,status:'new' as const};
  return {incoming:c,status:sig(match)===sig(c)?'identical' as const:'conflict' as const,match};
 });
}

export interface MergeReport{added:string[];replaced:string[];merged:string[];skipped:string[];renamed:Array<{from:string;to:string}>}
export interface MergeResult{list:Component[];report:MergeReport}

function uniqueName(base:string,taken:(n:string)=>boolean,suffix:string):string{
 const room=Math.max(1,LIMITS.name-suffix.length-4);const stem=base.length>room?base.slice(0,room).trimEnd():base;
 let n=`${stem} (${suffix})`.slice(0,LIMITS.name);for(let i=2;taken(n);i++)n=`${stem} (${suffix} ${i})`.slice(0,LIMITS.name);return n;
}

/**
 * Apply an import to a library. `decide` gives the resolution for each conflict (default 'keep-both').
 * Identical components are skipped, new ones added. Nothing is applied if the result would break a limit:
 * the function throws and the caller keeps the old list.
 * Id clashes are handled silently: an incoming component or variant whose id is already used by something else gets a fresh id.
 */
export function applyMerge(existing:Component[],incoming:Component[],decide:(item:MergeItem)=>Resolution,newId:()=>string):MergeResult{
 const report:MergeReport={added:[],replaced:[],merged:[],skipped:[],renamed:[]};
 let list=existing.map(c=>({...c,variants:[...c.variants]}));
 const usedIds=()=>new Set(list.flatMap(c=>[c.id]));
 const fresh=(c:Component,keepId:boolean):Component=>{
  const taken=usedIds();const id=keepId&&!taken.has(c.id)?c.id:newId();
  const map=new Map<string,string>();const variants=c.variants.map(v=>{const vid=newId();map.set(v.id,vid);return {...v,id:keepId?v.id:vid};});
  return {...c,id,variants,defaultVariantId:keepId?c.defaultVariantId:(map.get(c.defaultVariantId)??variants[0].id)};
 };
 for(const item of planMerge(list,incoming)){
  const c=item.incoming;
  if(item.status==='identical'){report.skipped.push(c.name);continue;}
  if(item.status==='new'){if(list.length>=LIMITS.components)throw new Error(`The library would pass ${LIMITS.components} components. Nothing was imported.`);list.push(fresh(c,true));report.added.push(c.name);continue;}
  const res=decide(item);const m=list.find(e=>same(e.name,c.name))!;
  if(res==='skip'){report.skipped.push(c.name);}
  else if(res==='replace'){list=list.map(e=>e===m?{...c,id:m.id,variants:c.variants.map(v=>({...v})),defaultVariantId:c.defaultVariantId}:e);report.replaced.push(c.name);}
  else if(res==='keep-both'){
   if(list.length>=LIMITS.components)throw new Error(`The library would pass ${LIMITS.components} components. Nothing was imported.`);
   const name=uniqueName(c.name,n=>list.some(e=>same(e.name,n)),'imported');const f=fresh({...c,name},false);list.push(f);report.renamed.push({from:c.name,to:name});report.added.push(name);
  }else{
   const variants=[...m.variants];
   for(const v of c.variants){
    const hit=variants.find(x=>same(x.name,v.name));
    if(hit){if(hit.html===v.html)continue;const nm=uniqueName(v.name,n=>variants.some(x=>same(x.name,n)),'imported');variants.push({id:newId(),name:nm,html:v.html});report.renamed.push({from:`${c.name} / ${v.name}`,to:`${c.name} / ${nm}`});}
    else variants.push({id:variants.some(x=>x.id===v.id)?newId():v.id,name:v.name,html:v.html});
   }
   if(variants.length>LIMITS.variants)throw new Error(`"${m.name}" would have more than ${LIMITS.variants} variants. Nothing was imported. Choose Skip or Keep both for it.`);
   list=list.map(e=>e===m?{...e,variants}:e);report.merged.push(m.name);
  }
 }
 // keep defaults valid
 list=list.map(c=>c.variants.some(v=>v.id===c.defaultVariantId)?c:{...c,defaultVariantId:variantOf(c).id});
 return {list,report};
}

/** One-line plain-language summary of a merge for the status notice. */
export function describeReport(r:MergeReport):string{
 const p:string[]=[];if(r.added.length)p.push(`${r.added.length} added`);if(r.replaced.length)p.push(`${r.replaced.length} replaced`);if(r.merged.length)p.push(`${r.merged.length} merged`);if(r.skipped.length)p.push(`${r.skipped.length} skipped`);
 return p.length?`Import done: ${p.join(', ')}.`:'Import done: nothing to change.';
}
