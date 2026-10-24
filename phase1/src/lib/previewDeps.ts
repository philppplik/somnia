import {parse,type DefaultTreeAdapterMap} from 'parse5';
import {assetType,resolveProjectPath} from './previewAssets';
import {resolveProjectPath as resolveModulePath,scanJsImports} from './previewResources';
/** Dependency graph of the page shown in the live preview: stylesheets (with @import chains), scripts, images and fonts. Pure (no DOM), so it runs in unit tests. */
type Node=DefaultTreeAdapterMap['node'];
export type PreviewFiles=Readonly<Record<string,string>>;
/** Binary files the preview can show (images, fonts, media) plus SVG, which the editor model already holds as text. */
export const isAssetPath=(p:string)=>!!assetType(p)||/\.svg$/i.test(p);
const resolveRef=resolveProjectPath;
const stripComments=(css:string)=>css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g,'');
const IMPORT=/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^"')\s;]+))\s*\)?([^;]*);?/gi;
const URL_FN=/url\(\s*(?:"([^"]+)"|'([^']+)'|([^"')\s]+))\s*\)/gi;
/** Stylesheets imported by a CSS text, and assets it references through url(). */
export function scanCss(css:string,from:string):{imports:string[];assets:string[]}{
 const text=stripComments(css),imports:string[]=[],assets:string[]=[];
 for(const m of text.matchAll(IMPORT)){const p=resolveRef(from,m[1]??m[2]??m[3]??'');if(p)imports.push(p);}
 for(const m of text.replace(IMPORT,'').matchAll(URL_FN)){const p=resolveRef(from,m[1]??m[2]??m[3]??'');if(p&&isAssetPath(p))assets.push(p);}
 return {imports,assets};
}
export interface PreviewDeps{
 /** Stylesheets linked from the page, in document order. */
 linkedCss:string[];
 /** Every stylesheet, linked or imported. */
 css:string[];
 js:string[];
 assets:string[];
 /** Everything above plus the page itself. */
 all:string[];
}
const walk=(n:Node,fn:(el:Extract<Node,{tagName:string}>)=>void)=>{if('tagName' in n)fn(n);if('childNodes' in n)for(const c of n.childNodes)walk(c,fn);if('content' in n&&n.content&&'childNodes' in n.content)for(const c of n.content.childNodes)walk(c,fn);};
const attr=(el:{attrs:Array<{name:string;value:string}>},name:string)=>el.attrs.find(a=>a.name===name)?.value;
const srcset=(v:string)=>v.split(',').map(s=>s.trim().split(/\s+/)[0]).filter(Boolean);
export function collectDeps(files:PreviewFiles,active:string):PreviewDeps{
 const linkedCss:string[]=[],js:string[]=[],assets=new Set<string>(),css=new Set<string>();
 const addAsset=(p:string|null)=>{if(p&&isAssetPath(p))assets.add(p);};
 const visitCss=(path:string,text:string)=>{const s=scanCss(text,path);for(const a of s.assets)addAsset(a);for(const i of s.imports)if(!css.has(i)){css.add(i);if(files[i]!=null)visitCss(i,files[i]);}};
 const inline=(text:string)=>{const s=scanCss(text,active);for(const a of s.assets)addAsset(a);for(const i of s.imports)if(!css.has(i)){css.add(i);if(files[i]!=null)visitCss(i,files[i]);}};
 const source=files[active]??'';
 walk(parse(source),el=>{
  const tag=el.tagName;
  if(tag==='link'){const rel=(attr(el,'rel')||'').toLowerCase().split(/\s+/),href=resolveRef(active,attr(el,'href')||'');
   if(href&&rel.includes('stylesheet')){if(!linkedCss.includes(href))linkedCss.push(href);if(!css.has(href)){css.add(href);if(files[href]!=null)visitCss(href,files[href]);}}
   else if(href&&(rel.includes('icon')||rel.includes('preload')))addAsset(href);}
  else if(tag==='script'){const src=attr(el,'src');const p=src?resolveRef(active,src):null;if(p&&!js.includes(p))js.push(p);}
  else if(tag==='style'){const t=el.childNodes.map(c=>'value' in c?c.value:'').join('');inline(t);}
  for(const name of ['src','poster','data'])if(tag==='img'||tag==='source'||tag==='video'||tag==='input'||tag==='image')addAsset(resolveRef(active,attr(el,name)||''));
  const ss=attr(el,'srcset');if(ss)for(const u of srcset(ss))addAsset(resolveRef(active,u));
  const style=attr(el,'style');if(style)inline(style);
 });
 // ES modules: imports of the page's scripts (inline or linked), followed transitively, are dependencies too.
 const visitJs=(from:string,text:string)=>{for(const spec of scanJsImports(text)){const p=resolveModulePath(from,spec);if(p&&!js.includes(p)){js.push(p);if(files[p]!=null)visitJs(p,files[p]);}}};
 walk(parse(source),el=>{if(el.tagName!=='script')return;const src=attr(el,'src');const p=src?resolveRef(active,src):null;if(src){if(p&&files[p]!=null)visitJs(p,files[p]);}else visitJs(active,el.childNodes.map(c=>'value' in c?c.value:'').join(''));});
 const all=[active,...css,...js,...assets];
 return {linkedCss,css:[...css],js,assets:[...assets],all:[...new Set(all)]};
}
/** Returns the stylesheet with its @import chain inlined (cycle-safe). `transform` runs on every file's own text with that file's path, so url() references resolve against the right folder. */
export function flattenCss(files:PreviewFiles,path:string,transform:(css:string,path:string)=>string=c=>c,seen:string[]=[]):string{
 const text=files[path];if(text==null||seen.includes(path))return '';
 return transform(text.replace(IMPORT,(_m,a,b,c,rest)=>{if(/\b(?:layer|supports)\s*\(/i.test(String(rest||'')))return _m;const p=resolveRef(path,a??b??c??'');if(!p)return '';const inner=flattenCss(files,p,transform,[...seen,path]);const media=String(rest||'').trim();return media?`@media ${media}{${inner}}`:inner;}),path);
}
export type PreviewPlan=
 |{kind:'none'}
 |{kind:'css';paths:string[]}
 |{kind:'full'};
/** Decides how to bring a running preview up to date. `none`: nothing the page depends on changed. `css`: only stylesheets changed; `paths` are the linked sheets to swap in place (no reload, scroll and page state stay). `full`: rebuild the document. Binary assets are handled by the asset watcher, which always asks for a rebuild. */
export function planPreviewUpdate(prev:{files:PreviewFiles;active:string},next:{files:PreviewFiles;active:string}):PreviewPlan{
 if(prev.active!==next.active)return {kind:'full'};
 if(prev.files[next.active]!==next.files[next.active])return {kind:'full'};
 const a=collectDeps(prev.files,prev.active),b=collectDeps(next.files,next.active);
 if(a.all.length!==b.all.length||a.all.some((p,i)=>p!==b.all[i])||a.linkedCss.join('|')!==b.linkedCss.join('|'))return {kind:'full'};
 for(const p of [...b.js,...b.css])if((prev.files[p]!=null)!==(next.files[p]!=null))return {kind:'full'};
 if(b.js.some(p=>prev.files[p]!==next.files[p]))return {kind:'full'};
 const paths=b.linkedCss.filter(p=>flattenCss(prev.files,p)!==flattenCss(next.files,p));
 return paths.length?{kind:'css',paths}:{kind:'none'};
}
