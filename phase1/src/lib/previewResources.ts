import {parse,type DefaultTreeAdapterMap} from 'parse5';
/**
 * Resource resolver for the live preview (W1). Scans the active HTML for linked files (CSS, JS, images, fonts, media, favicon,
 * CSS @import/url(), module imports) and loads them from the project folder through the native `read_project_resource` command,
 * including files that are not open in the editor. Pure and async: no DOM, no store, no iframe. The consumer (buildPreview) gets
 * `mergeTextResources(files,resources)` for text and `resources.assets` for binary data URLs.
 */
export const MAX_RESOURCE_FILES=300;
export const MAX_RESOURCE_TOTAL_BYTES=40_000_000;
export const MAX_RESOURCE_DEPTH=8;
const CONCURRENCY=6;
/** Native reply of `read_project_resource`: base64 data, MIME type from the extension, byte size. */
export interface ProjectResourceReply{mime:string;size:number;data:string}
export type ResourceInvoke=<T>(command:string,args?:Record<string,unknown>)=>Promise<T>;
export interface PreviewAsset{mime:string;/** `data:<mime>;base64,...` ready for src/url(). */dataUrl:string;size:number}
export interface PreviewResources{
 /** Text resources by project-relative path (css, js, json, svg, html). Open editor files win over disk, so this holds the live text. */
 text:Record<string,string>;
 /** Binary (and svg) resources by project-relative path, as data URLs. */
 assets:Record<string,PreviewAsset>;
 /** Referenced project files that could not be loaded: missing, too large, outside the root or over a limit. */
 failed:Array<{path:string;from:string;reason:'missing'|'too-large'|'outside-project'|'limit'|'error'}>;
}
export const emptyResources=():PreviewResources=>({text:{},assets:{},failed:[]});
export type RefKind='css'|'script'|'module'|'asset';
export interface ResourceRef{path:string;kind:RefKind}
const EXTERNAL=/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
/**
 * Resolves `href` (as written in `from`) to a normalized project-relative path. `/x` is relative to the project root, `..` and `.` are folded.
 * Returns null for external URLs, data:/blob:, fragments, empty values and paths escaping the project root (those are reported as 'outside-project' by the loader via `resolveProjectPathStrict`).
 */
export function resolveProjectPath(from:string,href:string):string|null{const r=resolveProjectPathStrict(from,href);return typeof r==='string'?r:null;}
export function resolveProjectPathStrict(from:string,href:string):string|null|'escape'{
 const raw=href.trim();if(!raw||raw.startsWith('#')||EXTERNAL.test(raw))return null;
 let clean=raw.split(/[?#]/)[0];if(!clean)return null;
 try{clean=decodeURIComponent(clean);}catch{/* keep as written */}
 if(clean.includes('\\')||clean.includes('\0'))return null;
 const base=clean.startsWith('/')?[]:from.split('/').slice(0,-1),out:string[]=[];
 for(const p of [...base,...clean.split('/')]){if(p==='..'){if(!out.length)return 'escape';out.pop();}else if(p&&p!=='.')out.push(p);}
 return out.length?out.join('/'):null;
}
/** `srcset` / `imagesrcset` candidates (WHATWG tokenizing: a URL runs to whitespace, so data URLs with commas survive). */
export function parseSrcset(value:string):string[]{
 const out:string[]=[];let i=0;const n=value.length;
 while(i<n){
  while(i<n&&/[\s,]/.test(value[i]))i++;
  let j=i;while(j<n&&!/\s/.test(value[j]))j++;
  let url=value.slice(i,j);i=j;
  if(url.endsWith(',')){url=url.replace(/,+$/,'');}else{while(i<n&&value[i]!==',')i++;}
  if(url&&!url.startsWith('data:'))out.push(url);
 }
 return out;
}
const stripComments=(css:string)=>css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g,' ');
/** url() and @import references of a stylesheet or style attribute. @import targets are kind 'css' (recursed), url() targets are assets. */
export function scanCssRefs(css:string):Array<{href:string;kind:'css'|'asset'}>{
 const text=stripComments(css),out:Array<{href:string;kind:'css'|'asset'}>=[];
 for(const m of text.matchAll(/@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|"([^"]*)"|'([^']*)')/gi)){const h=m[1]??m[2]??m[3]??m[4]??m[5];if(h)out.push({href:h,kind:'css'});}
 const imports=text.replace(/@import\s+(?:url\(\s*(?:"[^"]*"|'[^']*'|[^)\s]*)\s*\)|"[^"]*"|'[^']*')/gi,' ');
 for(const m of imports.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)){const h=m[1]??m[2]??m[3];if(h)out.push({href:h.trim(),kind:'asset'});}
 return out;
}
/** Static and dynamic relative imports of an ES module (string literals only). Bare specifiers are ignored. */
export function scanJsImports(js:string):string[]{
 const out:string[]=[];const text=js.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g,'$1');
 for(const m of text.matchAll(/(?:\bimport\s*(?:[\w*${}\s,]+?\s*from\s*)?|\bexport\s*(?:[\w*${}\s,]+?)\s*from\s*)(?:"([^"]+)"|'([^']+)')/g)){const s=m[1]??m[2];if(s&&/^(?:\.{0,2}\/)/.test(s))out.push(s);}
 for(const m of text.matchAll(/\bimport\s*\(\s*(?:"([^"]+)"|'([^']+)')\s*\)/g)){const s=m[1]??m[2];if(s&&/^(?:\.{0,2}\/)/.test(s))out.push(s);}
 return out;
}
type Node=DefaultTreeAdapterMap['node'];type El=DefaultTreeAdapterMap['element'];
const attr=(el:El,name:string)=>el.attrs.find(a=>a.name===name)?.value;
const textOf=(el:El)=>el.childNodes.map(c=>'value' in c?String((c as {value:string}).value):'').join('');
const LINK_RELS=/(?:^|\s)(stylesheet|icon|shortcut|apple-touch-icon|apple-touch-icon-precomposed|mask-icon|modulepreload|preload|prefetch)(?:\s|$)/i;
/** References of an HTML document, in document order, deduplicated by resolved target. `html` is the text of `active`. */
export function scanHtmlRefs(html:string,active:string):{refs:ResourceRef[];escaped:string[]}{
 const refs:ResourceRef[]=[],escaped:string[]=[],seen=new Set<string>();
 const add=(from:string,href:string|undefined,kind:RefKind)=>{if(!href)return;const r=resolveProjectPathStrict(from,href);if(r==='escape'){escaped.push(href);return;}if(!r)return;const k=kind+'\0'+r;if(seen.has(k))return;seen.add(k);refs.push({path:r,kind});};
 const addCss=(css:string)=>{for(const r of scanCssRefs(css))add(active,r.href,r.kind);};
 const walk=(node:Node)=>{
  if('tagName' in node){
   const el=node as El,tag=el.tagName;
   const style=attr(el,'style');if(style)addCss(style);
   if(tag==='link'){const rel=attr(el,'rel')||'';const m=LINK_RELS.exec(rel);if(m){const as=(attr(el,'as')||'').toLowerCase();const kind:RefKind=/stylesheet/i.test(rel)||(m[1].toLowerCase()==='preload'&&as==='style')?'css':m[1].toLowerCase()==='modulepreload'?'module':'asset';add(active,attr(el,'href'),kind);const set=attr(el,'imagesrcset');if(set)for(const u of parseSrcset(set))add(active,u,'asset');}}
   else if(tag==='script'){const src=attr(el,'src');const type=(attr(el,'type')||'').trim().toLowerCase();if(src)add(active,src,type==='module'?'module':'script');else if(!type||type==='module'||/^(?:text|application)\/(?:java|ecma)script$/.test(type))for(const s of scanJsImports(textOf(el)))add(active,s,'module');}
   else if(tag==='style')addCss(textOf(el));
   else if(['img','source','video','audio','track','embed'].includes(tag)){add(active,attr(el,'src'),'asset');const set=attr(el,'srcset');if(set)for(const u of parseSrcset(set))add(active,u,'asset');if(tag==='video')add(active,attr(el,'poster'),'asset');}
   else if(tag==='input'&&(attr(el,'type')||'').toLowerCase()==='image')add(active,attr(el,'src'),'asset');
   else if(tag==='image'||tag==='use'||tag==='feimage')add(active,attr(el,'href')??attr(el,'xlink:href'),'asset');
   else if(tag==='body'||tag==='table'||tag==='td'||tag==='th'||tag==='tr')add(active,attr(el,'background'),'asset');
   // <template> children live in `content`.
   const content=(el as unknown as {content?:{childNodes:Node[]}}).content;if(content)for(const c of content.childNodes)walk(c);
  }
  if('childNodes' in node)for(const c of node.childNodes)walk(c);
 };
 walk(parse(html));
 return {refs,escaped};
}
/** Decodes the bytes of a project text file like the editor does: UTF-16 by BOM, UTF-8 (BOM dropped), otherwise Windows-1252. */
export function decodeResourceBytes(bytes:Uint8Array):string{
 if(bytes[0]===0xFF&&bytes[1]===0xFE)return new TextDecoder('utf-16le').decode(bytes.subarray(2));
 if(bytes[0]===0xFE&&bytes[1]===0xFF)return new TextDecoder('utf-16be').decode(bytes.subarray(2));
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');}catch{return new TextDecoder('windows-1252').decode(bytes);}
}
const utf8=(b64:string):string=>{const bin=atob(b64);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return decodeResourceBytes(bytes);};
const isText=(path:string,mime:string)=>/^text\/(?:css|javascript|html|plain)$|^application\/json$/.test(mime)||/\.(?:css|m?js|cjs|json|html?)$/i.test(path);
const reasonOf=(e:unknown):PreviewResources['failed'][number]['reason']=>{const m=typeof e==='object'&&e&&'code' in e?String((e as {code:unknown}).code):String(e instanceof Error?e.message:e);return /limit|large/i.test(m)?'too-large':/not.?found|no such|NotFound|missing/i.test(m)?'missing':'error';};
export interface LoadOptions{
 invoke:ResourceInvoke;projectId:string;
 /** Open editor files by project-relative path; they win over disk for text resources. */
 files:Readonly<Record<string,string>>;
 /** Project-relative path of the active HTML document. */
 active:string;
 signal?:AbortSignal;
 /** Binary assets already cached by the consumer are not read again. */
 skip?:(path:string)=>boolean;
 maxFiles?:number;maxTotalBytes?:number;maxDepth?:number;
}
/**
 * Scans `files[active]` and loads everything it links, recursively through CSS @import/url() and ES module imports.
 * Never throws for a single bad resource: failures are collected in `failed`. Resolves with whatever was loaded if `signal` aborts.
 */
export async function loadPreviewResources(o:LoadOptions):Promise<PreviewResources>{
 const out=emptyResources(),maxFiles=o.maxFiles??MAX_RESOURCE_FILES,maxTotal=o.maxTotalBytes??MAX_RESOURCE_TOTAL_BYTES,maxDepth=o.maxDepth??MAX_RESOURCE_DEPTH;
 const html=o.files[o.active];if(html==null)return out;
 const seen=new Set<string>([o.active]);let total=0,count=0;
 const first=scanHtmlRefs(html,o.active);
 for(const href of first.escaped)out.failed.push({path:href,from:o.active,reason:'outside-project'});
 let level:Array<ResourceRef&{from:string}>=first.refs.map(r=>({...r,from:o.active}));
 for(let depth=0;level.length&&depth<=maxDepth&&!o.signal?.aborted;depth++){
  const next:Array<ResourceRef&{from:string}>=[];
  const queue=level.filter(r=>{if(seen.has(r.path))return false;seen.add(r.path);return true;});
  const work=async(r:ResourceRef&{from:string})=>{
   if(o.signal?.aborted)return;
   if(r.kind==='asset'&&o.skip?.(r.path))return;
   if(count>=maxFiles||total>=maxTotal){out.failed.push({path:r.path,from:r.from,reason:'limit'});return;}
   count++;
   let text:string|undefined=Object.hasOwn(o.files,r.path)&&r.kind!=='asset'?o.files[r.path]:undefined;
   if(text===undefined){
    let reply:ProjectResourceReply;
    try{reply=await o.invoke<ProjectResourceReply>('read_project_resource',{projectId:o.projectId,path:r.path});}catch(e){out.failed.push({path:r.path,from:r.from,reason:reasonOf(e)});return;}
    if(total+reply.size>maxTotal){out.failed.push({path:r.path,from:r.from,reason:'limit'});return;}
    total+=reply.size;
    if(r.kind==='asset'||!isText(r.path,reply.mime)){out.assets[r.path]={mime:reply.mime,dataUrl:`data:${reply.mime};base64,${reply.data}`,size:reply.size};
     if(/\.svg$/i.test(r.path)||reply.mime==='image/svg+xml'){try{out.text[r.path]=utf8(reply.data);}catch{/* keep data URL only */}}
     return;}
    try{text=utf8(reply.data);}catch{out.failed.push({path:r.path,from:r.from,reason:'error'});return;}
   }
   out.text[r.path]=text;
   if(r.kind==='css'){for(const c of scanCssRefs(text)){const t=resolveProjectPathStrict(r.path,c.href);if(t==='escape')out.failed.push({path:c.href,from:r.path,reason:'outside-project'});else if(t)next.push({path:t,kind:c.kind,from:r.path});}}
   else if(r.kind==='module'||r.kind==='script'){for(const s of scanJsImports(text)){const t=resolveProjectPathStrict(r.path,s);if(t==='escape')out.failed.push({path:s,from:r.path,reason:'outside-project'});else if(t)next.push({path:t,kind:'module',from:r.path});}}
  };
  for(let i=0;i<queue.length&&!o.signal?.aborted;i+=CONCURRENCY)await Promise.all(queue.slice(i,i+CONCURRENCY).map(work));
  level=next;
 }
 return out;
}
const IMPORT_RULE=/@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|"([^"]*)"|'([^']*)')\s*([^;]*);/gi;
const relativeTo=(fromFile:string,target:string):string=>{const from=fromFile.split('/').slice(0,-1),to=target.split('/');let i=0;while(i<from.length&&i<to.length-1&&from[i]===to[i])i++;return [...from.slice(i).map(()=>'..'),...to.slice(i)].join('/');};
/**
 * The sandboxed preview inlines linked stylesheets as <style>, where a relative @import cannot load. This replaces every @import of a project
 * stylesheet with that sheet's text (recursively, cycles dropped, media query kept as @media) and re-points its url() references at the importing file's folder.
 * Imports that are external or missing are left untouched.
 */
export function flattenCssImports(css:string,path:string,text:Readonly<Record<string,string>>,trail:readonly string[]=[]):string{
 return css.replace(IMPORT_RULE,(whole,a,b,c,d,e,media)=>{
  const href=(a??b??c??d??e??'').trim();if(/\b(?:layer|supports)\s*\(/i.test(String(media||'')))return whole;const target=resolveProjectPath(path,href);
  if(!target||trail.includes(target)||target===path)return trail.includes(target??'')||target===path?'':whole;
  const body=text[target];if(body==null)return whole;
  let inner=flattenCssImports(body,target,text,[...trail,path]);
  inner=inner.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]+))\s*\)/gi,(w,x,y,z)=>{const ref=(x??y??z??'').trim();const t=resolveProjectPath(target,ref);return t?`url("${relativeTo(path,t)}")`:w;});
  const q=String(media||'').trim();return q?`@media ${q}{${inner}}`:inner;
 });
}
/** Open editor files plus loaded text resources, as the in-memory map buildPreview already understands. Editor text wins. Stylesheet @imports are flattened. */
export function mergeTextResources(files:Readonly<Record<string,string>>,r:PreviewResources):Record<string,string>{
 const merged={...r.text,...files};
 for(const [p,t] of Object.entries(merged))if(/\.css$/i.test(p)&&/@import/i.test(t))merged[p]=flattenCssImports(t,p,merged);
 return merged;
}
/** Mirrors `resource_mime` in src-tauri/src/service.rs (the web build has no native side). */
const MIMES:Record<string,string>={html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',cjs:'text/javascript',json:'application/json',map:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',bmp:'image/bmp',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp4:'video/mp4',m4v:'video/mp4',webm:'video/webm',ogv:'video/ogg',mov:'video/quicktime',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',oga:'audio/ogg',m4a:'audio/mp4',flac:'audio/flac',txt:'text/plain',wasm:'application/wasm'};
export const resourceMimeFor=(path:string):string=>MIMES[(path.split('.').pop()||'').toLowerCase()]??'application/octet-stream';
