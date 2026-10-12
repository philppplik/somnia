import {resolveProjectPath} from './previewResources';
/** Project-only link resolution. Never accesses disk or accepts URL schemes as paths. */
export type PreviewLink = {kind:'local';file:string;hash:string}|{kind:'external';url:string}|{kind:'blocked'};
export function resolvePreviewLink(files:Readonly<Record<string,string>>,active:string,href:string,allowUnloaded=false):PreviewLink {
 if(/[\u0000-\u001f\u007f]/.test(href))return {kind:'blocked'};
 const value=href.trim();
 if(!value||value.length>4096||/[\u0000-\u0020\u007f\\]/.test(value))return {kind:'blocked'};
 if(/^(https?:\/\/|\/\/)/i.test(value)){
  try{const url=new URL(value.startsWith('//')?'https:'+value:value);if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)return {kind:'blocked'};return {kind:'external',url:url.href};}catch{return {kind:'blocked'};}
 }
 if(/^[a-z][a-z\d+.-]*:/i.test(value))return {kind:'blocked'};
 const split=value.indexOf('#');const hash=split<0?'':value.slice(split);
 const path=(split<0?value:value.slice(0,split)).split('?')[0];
 if(!path)return {kind:'local',file:active,hash};
 let decoded:string;try{decoded=decodeURIComponent(path);}catch{return {kind:'blocked'};}
 if(/[\u0000-\u001f\u007f\\:%?#]/.test(decoded)||decoded.startsWith('//'))return {kind:'blocked'};
 const file=resolveProjectPath(active,path);
 return file&&/\.html?$/i.test(file)&&(allowUnloaded||Object.hasOwn(files,file))?{kind:'local',file,hash}:{kind:'blocked'};
}
export type PreviewVisit={file:string;hash:string;y:number};
export type PreviewHistory={entries:PreviewVisit[];index:number};
export const newPreviewHistory=(file:string):PreviewHistory=>({entries:[{file,hash:'',y:0}],index:0});
export function visitPreview(history:PreviewHistory,link:Extract<PreviewLink,{kind:'local'}>):PreviewHistory{
 const current=history.entries[history.index];
 if(current.file===link.file&&current.hash===link.hash)return history;
 return {entries:[...history.entries.slice(0,history.index+1),{file:link.file,hash:link.hash,y:0}].slice(-100),index:Math.min(history.index+1,99)};
}
