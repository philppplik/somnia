/**
 * Component system, pure logic (no DOM, no storage, no store). Safe to unit test in Node.
 * A component is a named block of HTML with one or more variants (for example "Primary" and "Outline").
 * Storage and editor wiring live in componentActions.ts.
 */
export interface Variant{id:string;name:string;html:string}
export interface Component{id:string;name:string;variants:Variant[];defaultVariantId:string}
export const LIMITS={components:40,variants:8,html:100000,name:60} as const;
export const ATTR_COMPONENT='data-somnia-component';
export const ATTR_VARIANT='data-somnia-variant';

const cleanName=(raw:string,what:string)=>{const n=String(raw??'').trim();if(!n||n.length>LIMITS.name)throw new Error(`${what} name must have 1-${LIMITS.name} characters.`);return n;};
const checkHtml=(html:string)=>{if(!html.trim())throw new Error('Select an HTML source layer first. The block is empty.');if(html.length>LIMITS.html)throw new Error('This block exceeds the 100 KB library limit.');};
const find=(list:Component[],id:string)=>{const c=list.find(x=>x.id===id);if(!c)throw new Error('This component no longer exists.');return c;};
const sameName=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();

/** End index (exclusive) of the opening tag that starts at `start` (a "<"), skipping quoted attribute values. -1 if unterminated. */
export function openTagEnd(html:string,start:number):number{let q='';for(let i=start+1;i<html.length;i++){const ch=html[i];if(q){if(ch===q)q='';}else if(ch==='"'||ch==="'")q=ch;else if(ch==='>')return i+1;}return -1;}
function rootOpenTag(html:string):{start:number;end:number}|null{const m=/^\s*<([a-zA-Z][\w-]*)/.exec(html);if(!m)return null;const start=m[0].length-m[1].length-1;const end=openTagEnd(html,start);return end<0?null:{start,end};}

/** Values of every id="..." attribute in a snippet of HTML. */
export function idsIn(html:string):string[]{const out:string[]=[];const re=/<[a-zA-Z][^>]*?\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/g;let m;while((m=re.exec(html))){const v=m[1]??m[2]??m[3];if(v)out.push(v);}return out;}

/** Returns a plain-language problem if inserting `html` would repeat an ID, otherwise null. */
export function idConflict(html:string,existing:Iterable<string>):string|null{const used=new Set(existing);const ids=idsIn(html);if(new Set(ids).size!==ids.length)return 'This block repeats an ID inside itself. Fix the ID in source before using it.';const dup=ids.find(id=>used.has(id));return dup?`This block would repeat the source ID "${dup}". Rename the ID in source first.`:null;}

/** Removes Somnia marker attributes from the root tag so a saved copy never carries stale marks. */
export function stripMarks(html:string):string{const r=rootOpenTag(html);if(!r)return html;const tag=html.slice(r.start,r.end).replace(/\s+data-somnia-(?:component|variant|overrides)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g,'');return html.slice(0,r.start)+tag+html.slice(r.end);}

/** Adds the marker attributes to the root tag so the editor can later tell which component/variant a block came from. */
export function markInstance(html:string,componentId:string,variantId:string):string{const clean=stripMarks(html);const r=rootOpenTag(clean);if(!r)return clean;const tag=clean.slice(r.start,r.end);const selfClose=/\/\s*>$/.test(tag);const cut=r.end-(selfClose?(/\s*\/>$/.exec(tag)![0].length):1);return clean.slice(0,cut)+` ${ATTR_COMPONENT}="${componentId}" ${ATTR_VARIANT}="${variantId}"`+clean.slice(cut);}

export function instanceOf(attrs:Record<string,string>|undefined):{componentId:string;variantId:string}|null{const c=attrs?.[ATTR_COMPONENT],v=attrs?.[ATTR_VARIANT];return c&&v?{componentId:c,variantId:v}:null;}

/** Classes on the root element of a snippet. */
export function rootClasses(html:string):string[]{const r=rootOpenTag(html);if(!r)return [];const m=/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(html.slice(r.start,r.end));return m?(m[1]??m[2]).split(/\s+/).filter(Boolean):[];}
/** What changes on the root element when going from variant `a` to variant `b`. */
export function classDiff(a:string,b:string):{added:string[];removed:string[]}{const x=new Set(rootClasses(a)),y=new Set(rootClasses(b));return {added:[...y].filter(c=>!x.has(c)),removed:[...x].filter(c=>!y.has(c))};}
export function describeDiff(d:{added:string[];removed:string[]}):string{const parts=[...d.added.map(c=>`+${c}`),...d.removed.map(c=>`-${c}`)];return parts.length?parts.join(' '):'same root classes';}

/** Replace source[from,to) with html. Used to switch a block to another variant in one edit. */
export function splice(source:string,from:number,to:number,html:string):string{if(from<0||to<from||to>source.length)throw new Error('The selected block moved. Select it again.');return source.slice(0,from)+html+source.slice(to);}
/** IDs in the source once the range being replaced is taken out. */
export function idsOutside(source:string,from:number,to:number):string[]{return idsIn(source.slice(0,from)+source.slice(to));}

export function createComponent(list:Component[],name:string,html:string,newId:()=>string):Component[]{const n=cleanName(name,'Component');checkHtml(html);if(list.length>=LIMITS.components)throw new Error(`Library limit is ${LIMITS.components} components. Remove one before saving.`);if(list.some(c=>sameName(c.name,n)))throw new Error(`A component named "${n}" already exists. Add it as a variant instead.`);const vid=newId();return [...list,{id:newId(),name:n,defaultVariantId:vid,variants:[{id:vid,name:'Default',html:stripMarks(html)}]}];}
export function addVariant(list:Component[],componentId:string,name:string,html:string,newId:()=>string):Component[]{const c=find(list,componentId);const n=cleanName(name,'Variant');checkHtml(html);if(c.variants.length>=LIMITS.variants)throw new Error(`A component can have ${LIMITS.variants} variants at most.`);if(c.variants.some(v=>sameName(v.name,n)))throw new Error(`"${c.name}" already has a variant named "${n}".`);return list.map(x=>x.id===c.id?{...x,variants:[...x.variants,{id:newId(),name:n,html:stripMarks(html)}]}:x);}
export function updateVariant(list:Component[],componentId:string,variantId:string,html:string):Component[]{const c=find(list,componentId);if(!c.variants.some(v=>v.id===variantId))throw new Error('This variant no longer exists.');checkHtml(html);return list.map(x=>x.id===c.id?{...x,variants:x.variants.map(v=>v.id===variantId?{...v,html:stripMarks(html)}:v)}:x);}
export function removeVariant(list:Component[],componentId:string,variantId:string):Component[]{const c=find(list,componentId);if(c.variants.length<=1)throw new Error('A component needs at least one variant. Remove the whole component instead.');const variants=c.variants.filter(v=>v.id!==variantId);if(variants.length===c.variants.length)throw new Error('This variant no longer exists.');return list.map(x=>x.id===c.id?{...x,variants,defaultVariantId:variants.some(v=>v.id===x.defaultVariantId)?x.defaultVariantId:variants[0].id}:x);}
export function setDefaultVariant(list:Component[],componentId:string,variantId:string):Component[]{const c=find(list,componentId);if(!c.variants.some(v=>v.id===variantId))throw new Error('This variant no longer exists.');return list.map(x=>x.id===c.id?{...x,defaultVariantId:variantId}:x);}
export function renameComponent(list:Component[],componentId:string,name:string):Component[]{const c=find(list,componentId);const n=cleanName(name,'Component');if(list.some(x=>x.id!==c.id&&sameName(x.name,n)))throw new Error(`A component named "${n}" already exists.`);return list.map(x=>x.id===c.id?{...x,name:n}:x);}
export function renameVariant(list:Component[],componentId:string,variantId:string,name:string):Component[]{const c=find(list,componentId);const n=cleanName(name,'Variant');if(c.variants.some(v=>v.id!==variantId&&sameName(v.name,n)))throw new Error(`"${c.name}" already has a variant named "${n}".`);return list.map(x=>x.id===c.id?{...x,variants:x.variants.map(v=>v.id===variantId?{...v,name:n}:v)}:x);}
export function removeComponent(list:Component[],componentId:string):Component[]{return list.filter(c=>c.id!==componentId);}
export function variantOf(c:Component,variantId?:string):Variant{return c.variants.find(v=>v.id===variantId)??c.variants.find(v=>v.id===c.defaultVariantId)??c.variants[0];}

const isStr=(x:unknown):x is string=>typeof x==='string';
/** Read stored JSON defensively. Bad entries are dropped, never thrown. */
export function parseLibrary(raw:string|null|undefined):Component[]{let x:unknown;try{x=JSON.parse(raw||'[]');}catch{return [];}if(!Array.isArray(x))return [];const out:Component[]=[];for(const c of x){if(!c||!isStr(c.id)||!isStr(c.name)||!Array.isArray(c.variants))continue;const variants:Variant[]=c.variants.filter((v:any)=>v&&isStr(v.id)&&isStr(v.name)&&isStr(v.html)&&v.html.length<=LIMITS.html).slice(0,LIMITS.variants);if(!variants.length)continue;out.push({id:c.id,name:c.name,variants,defaultVariantId:variants.some(v=>v.id===c.defaultVariantId)?c.defaultVariantId:variants[0].id});if(out.length>=LIMITS.components)break;}return out;}
/** Old v1 library: flat list of {id,name,html}. Each becomes a component with one "Default" variant. */
export function migrateLegacy(raw:string|null|undefined,newId:()=>string):Component[]{let x:unknown;try{x=JSON.parse(raw||'[]');}catch{return [];}if(!Array.isArray(x))return [];const out:Component[]=[];for(const c of x){if(!c||!isStr(c.id)||!isStr(c.name)||!isStr(c.html)||c.html.length>LIMITS.html||!c.name.trim())continue;const vid=newId();out.push({id:c.id,name:c.name.trim().slice(0,LIMITS.name),defaultVariantId:vid,variants:[{id:vid,name:'Default',html:stripMarks(c.html)}]});if(out.length>=LIMITS.components)break;}return out;}
