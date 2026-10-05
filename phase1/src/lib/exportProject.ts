import {ensureUtf8Charset} from './textEncoding';
import {htmlToMarkdown} from '@somnia/editor-core';
import {zipSync,strToU8} from 'fflate';
export function projectArchive(files:Readonly<Record<string,string>>){
 const entries:Record<string,Uint8Array>={};for(const [path,source] of Object.entries(files)){
  if(path.startsWith('/')||path.split('/').some(p=>p==='..'||!p)||path.includes('\\'))throw Error(`Unsafe export path: ${path}`);
  entries[path]=strToU8(/\.html?$/i.test(path)?ensureUtf8Charset(source):source);
 }
 if(!Object.keys(entries).length)throw Error('No project files to export.');return zipSync(entries);
}
export function downloadProject(files:Readonly<Record<string,string>>,name:string){
 const bytes=projectArchive(files);const blob=new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'application/zip'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${name.replace(/[^\w-]/g,'_')||'somnia-project'}.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
export function markdownFileName(path:string){return `${(path.split('/').pop()||'document').replace(/\.[^.]*$/,'').replace(/[^\w-]/g,'_')||'document'}.md`;}
export function downloadMarkdown(files:Readonly<Record<string,string>>,activeFile:string){
 const source=files[activeFile];if(typeof source!=='string'||!/\.html?$/i.test(activeFile))throw Error('Open an HTML file to export it as Markdown.');
 const blob=new Blob([htmlToMarkdown(source)],{type:'text/markdown;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=markdownFileName(activeFile);link.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}

/** Single-file export: the page with its local stylesheets and scripts inlined. Remote URLs and missing files stay as they are. */
export function inlineHtml(files:Readonly<Record<string,string>>,htmlPath:string,opts:{css:boolean;js:boolean}):string{
 const dir=htmlPath.includes('/')?htmlPath.slice(0,htmlPath.lastIndexOf('/')+1):'';
 const find=(href:string)=>{if(/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href))return undefined;const clean=href.split(/[?#]/)[0];const parts:string[]=[];for(const seg of (dir+clean).split('/')){if(seg==='..')parts.pop();else if(seg&&seg!=='.')parts.push(seg);}return files[parts.join('/')];};
 let out=files[htmlPath]??'';
 if(opts.css)out=out.replace(/<link\b[^>]*>/gi,tag=>{if(!/rel\s*=\s*["']?stylesheet/i.test(tag))return tag;const href=/href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];const css=href?find(href):undefined;return css===undefined?tag:`<style>\n${css.replace(/<\/style/gi,'<\\/style')}\n</style>`;});
 if(opts.js)out=out.replace(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi,(tag,a,src,b)=>{const js=find(src);return js===undefined?tag:`<script${(a+b).trimEnd()}>\n${js.replace(/<\/script/gi,'<\\/script')}\n</script>`;});
 return out;}
/** Single-file export text: inlined page declaring UTF-8. */
export function singleFileHtml(files:Readonly<Record<string,string>>,htmlPath:string,opts:{css:boolean;js:boolean}):string{return ensureUtf8Charset(inlineHtml(files,htmlPath,opts));}
export function downloadText(text:string,name:string,type='text/html'){const blob=new Blob([text],{type:/^text\//.test(type)&&!/charset/i.test(type)?`${type};charset=utf-8`:type});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);}
