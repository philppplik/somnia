import {parse,type DefaultTreeAdapterMap} from 'parse5';
import {installPreviewNavigation} from './previewNavigationBridge';
import {injectMotionSafe} from './motionSafe';
import type {PreviewScriptLocation} from './previewErrorLocation';
import {PREVIEW_ASSET_CSP,inlineBinaryAssets,inlineCssAssets} from './previewAssets';
import {flattenCss} from './previewDeps';
/** Builds the srcDoc for the opt-in live preview. Runs in a sandboxed iframe (allow-scripts only, opaque origin). Project CSS and JS are inlined from the project files; no network. */
const resolve=(active:string,href:string)=>{if(/^(?:[a-z]+:|\/\/|\/)/i.test(href))return null;const parts=[...active.split('/').slice(0,-1),...href.split(/[?#]/)[0].split('/')],out:string[]=[];for(const p of parts){if(p==='..')out.pop();else if(p&&p!=='.')out.push(p);}return out.join('/');};
const esc=(s:string)=>s.replace(/<\/(script)/gi,'<\\/$1');
export function buildPreview(files:Readonly<Record<string,string>>,active:string,scripts:boolean,scrollY=0,assets:ReadonlyMap<string,string>=new Map(),hash=''):{html:string;scripts:PreviewScriptLocation[];id:string;blocked:string[];assetRefs:string[]}{
 const blocked:string[]=[];const assetPass={refs:new Set<string>()},linkedStyles=new Set<Element>();
 const id=crypto.randomUUID(),nonce=crypto.randomUUID(),marker='data-somnia-preview-'+id.replaceAll('-','');
 const source=(files[active]??'').replace(/\r\n?/g,'\n');
 const originals:Array<{to:number;line:number;col:number}>=[];
 const walk=(node:DefaultTreeAdapterMap['node'])=>{
  if('tagName' in node&&node.tagName==='script'&&node.sourceCodeLocation?.startTag){const loc=node.sourceCodeLocation;originals.push({to:loc.startTag!.endOffset,line:loc.startTag!.endLine,col:loc.startTag!.endCol});}
  // Template contents are inert, and DOM querySelectorAll does not include them.
  if('childNodes' in node)for(const child of node.childNodes)walk(child);
 };
 walk(parse(source,{sourceCodeLocationInfo:true}));
 let marked=source;for(let i=originals.length-1;i>=0;i--){const at=originals[i].to-1;marked=marked.slice(0,at)+` ${marker}="${i}"`+marked.slice(at);}
 const doc=new DOMParser().parseFromString(marked,'text/html');
 const locations:Array<Omit<PreviewScriptLocation,'generatedLine'|'generatedCol'>&{index:string}>=[];
 for(const el of doc.querySelectorAll('base,meta[http-equiv],iframe,object,embed'))el.remove();
 for(const el of doc.querySelectorAll('link[rel=stylesheet]')){const f=resolve(active,el.getAttribute('href')||'');const css=f?files[f]:null;if(css!=null){const s=doc.createElement('style');s.textContent=flattenCss(files,f!,(text,path)=>inlineCssAssets(text,path,assets,assetPass));s.setAttribute('data-somnia-css',f!);linkedStyles.add(s);el.replaceWith(s);}else{const h=el.getAttribute('href');if(h&&/^(?:[a-z]+:)?\/\//i.test(h))blocked.push(h);el.remove();}}
 for(const el of doc.querySelectorAll('script')){
  const index=el.getAttribute(marker);const original=index!=null?originals[Number(index)]:null;
  if(!scripts){el.remove();continue;}
  const src=el.getAttribute('src');const file=src?resolve(active,src):active;
  const js=src?(file?files[file]:null):el.textContent;
  if(js==null){if(src&&/^(?:[a-z]+:)?\/\//i.test(src))blocked.push(src);el.remove();continue;}
  const type=(el.getAttribute('type')||'').trim().toLowerCase();
  const executable=!type||['module','text/javascript','application/javascript','text/ecmascript','application/ecmascript'].includes(type);
  const content=esc(js.replace(/\r\n?/g,'\n'));
  if(src){const replacement=doc.createElement('script');if(type)replacement.setAttribute('type',type);if(index!=null)replacement.setAttribute(marker,index);el.replaceWith(replacement);replacement.textContent=content;}
  const script=src?doc.querySelector(`script[${marker}="${index}"]`):el;
  if(executable&&original&&file&&script){
   const url=`somnia-preview://script/${id}/${index}/${encodeURIComponent(file)}`;
   script.textContent=content+'\n//# sourceURL='+url;
   locations.push({index:index!,file,url,sourceLine:src?1:original.line,sourceCol:src?1:original.col,content});
  }
 }
 for(const el of doc.querySelectorAll('img[src]')){const f=resolve(active,el.getAttribute('src')||'');const svg=f&&/\.svg$/i.test(f)?files[f]:null;if(svg!=null)el.setAttribute('src','data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));}
 inlineBinaryAssets(doc,active,assets,assetPass,linkedStyles);
 installPreviewNavigation(doc,id,nonce,hash,scrollY);
 for(const a of ['target'])for(const el of doc.querySelectorAll(`[${a}]`))el.removeAttribute(a);
 // Without scripts, or when an external animation library (CDN) was blocked, nothing would un-hide reveal-on-scroll content.
 injectMotionSafe(doc,{settle:!scripts,reveal:!scripts||blocked.length>0});
 const meta=doc.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content=`default-src 'none'; script-src ${scripts?"'unsafe-inline'":`'nonce-${nonce}'`}; style-src 'unsafe-inline'; ${PREVIEW_ASSET_CSP}; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'`;
 doc.head.prepend(meta);
 if(scripts){const b=doc.createElement('script');b.textContent=`(function(){var p=function(m){try{parent.postMessage(m,'*')}catch(e){}};addEventListener('error',function(e){if(e.target&&e.target!==window){p({somnia:'error',id:${JSON.stringify(id)},message:'Failed to load '+(e.target.src||e.target.href||e.target.localName)});return}p({somnia:'error',id:${JSON.stringify(id)},message:String(e.message),filename:e.filename,line:e.lineno,col:e.colno,syntax:!!(e.error&&e.error.name==='SyntaxError'&&!/\\n\\s*at\\s/.test(e.error.stack||''))})},true);addEventListener('unhandledrejection',function(e){p({somnia:'error',id:${JSON.stringify(id)},message:'Unhandled promise rejection: '+String(e.reason),stack:e.reason&&typeof e.reason.stack==='string'?e.reason.stack:''})});var t;addEventListener('scroll',function(){clearTimeout(t);t=setTimeout(function(){p({somnia:'scroll',id:${JSON.stringify(id)},y:scrollY})},100)});})();`;doc.head.prepend(b);}
 const html='<!doctype html>'+doc.documentElement.outerHTML;
 const mapped:PreviewScriptLocation[]=[];
 // Parse the finished HTML, rather than searching for '>' (quoted attributes may contain it).
 const generated=new Map<string,{line:number;col:number}>();
 const collect=(node:DefaultTreeAdapterMap['node'])=>{
  if('tagName' in node&&node.tagName==='script'){
   const index=node.attrs.find(a=>a.name===marker)?.value,tag=node.sourceCodeLocation?.startTag;
   if(index!=null&&tag)generated.set(index,{line:tag.endLine,col:tag.endCol});
  }
  if('childNodes' in node)for(const child of node.childNodes)collect(child);
 };
 collect(parse(html,{sourceCodeLocationInfo:true}));
 for(const location of locations){
  const at=generated.get(location.index);if(!at)continue;
  const {index:_,...rest}=location;
  mapped.push({...rest,generatedLine:at.line,generatedCol:at.col});
 }
 return {html,scripts:mapped,id,blocked,assetRefs:[...assetPass.refs]};
}
/** Compatibility wrapper for callers that only need HTML. */
export function buildPreviewDoc(files:Readonly<Record<string,string>>,active:string,scripts:boolean,scrollY=0):string{return buildPreview(files,active,scripts,scrollY).html;}
