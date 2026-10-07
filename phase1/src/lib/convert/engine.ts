import {htmlToMarkdown} from '@somnia/editor-core';
import {loadMarkdown,renderMarkdown} from '../markdownRender';
import {FORMATS,TARGETS,baseName,decodeUtf8,type FormatId} from './formats';
import {formatDelimited,htmlDocument,htmlToText,jsonToRows,parseDelimited,rowsToHtmlTable,tableToJson,textToHtml} from './text';
/** Turns image bytes into another raster format. Browser implementation lives in raster.ts; tests inject a fake. */
export type Rasterizer=(bytes:Uint8Array,from:FormatId,to:'png'|'jpg'|'webp',quality:number)=>Promise<Uint8Array>;
export interface ConvertOptions{quality?:number;rasterize?:Rasterizer}
export interface Converted{name:string;bytes:Uint8Array;mime:string}
const MAX_TEXT_BYTES=8*1024*1024;
const enc=(s:string)=>new TextEncoder().encode(s);
/** Convert one file. Throws a readable Error when the pair is unsupported or the content is invalid; never returns a stub. */
export async function convertFile(name:string,bytes:Uint8Array,from:FormatId,to:FormatId,opt:ConvertOptions={}):Promise<Converted>{
 if(from==='unknown')throw Error('Unrecognised file type');
 if(!TARGETS[from].includes(to))throw Error(`${FORMATS[from].label} cannot be converted to ${to==='unknown'?'this format':FORMATS[to].label}`);
 const title=baseName(name);const out=(text:string):Converted=>({name:`${title}.${FORMATS[to as Exclude<FormatId,'unknown'>].ext}`,bytes:enc(text),mime:FORMATS[to as Exclude<FormatId,'unknown'>].mime});
 const info=FORMATS[to as Exclude<FormatId,'unknown'>];
 if(info.kind==='image'){
  if(!opt.rasterize)throw Error('Image conversion needs a browser canvas');
  const q=Math.min(1,Math.max(0.1,opt.quality??0.92));
  const data=await opt.rasterize(bytes,from,to as 'png'|'jpg'|'webp',q);
  return {name:`${title}.${info.ext}`,bytes:data,mime:info.mime};}
 if(bytes.length>MAX_TEXT_BYTES)throw Error('Text file is larger than 8 MB');
 const text=decodeUtf8(bytes);
 switch(`${from}>${to}`){
  case 'md>html':{await loadMarkdown();return out(htmlDocument(title,renderMarkdown(text)));}
  case 'md>txt':{await loadMarkdown();return out(htmlToText(renderMarkdown(text)));}
  case 'html>md':return out(htmlToMarkdown(text));
  case 'html>txt':return out(htmlToText(text));
  case 'txt>html':return out(textToHtml(text,title));
  case 'txt>md':return out(text.replace(/\r\n?/g,'\n'));
  case 'csv>json':return out(tableToJson(parseDelimited(text,',')));
  case 'tsv>json':return out(tableToJson(parseDelimited(text,'\t')));
  case 'csv>tsv':return out(formatDelimited(parseDelimited(text,','),'\t'));
  case 'tsv>csv':return out(formatDelimited(parseDelimited(text,'\t'),','));
  case 'csv>html':return out(rowsToHtmlTable(parseDelimited(text,','),title));
  case 'json>csv':return out(formatDelimited(jsonToRows(text),','));
 }
 throw Error(`No converter for ${from} to ${to}`);}
