/** Source-backed media widths. No CSS reformatting: edits replace only a numeric token. */
import {cssRegions,isCss} from './cssTools';
export interface MediaWidth {file:string;query:string;kind:'min'|'max';width:number;start:number;end:number;line:number;canScope:boolean}
export const validMediaWidth=(value:string)=>/^\d+$/.test(value.trim())&&Number(value)>=200&&Number(value)<=3840;
/** Blank strings as well as comments, keeping source offsets stable. */
function maskStrings(text:string):string {
 return text.replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g,m=>m.replace(/[^\n]/g,' '));
}
export function listMediaWidths(files:Readonly<Record<string,string>>):MediaWidth[]{
 const out:MediaWidth[]=[];
 for(const region of cssRegions(files)){
  const masked=maskStrings(region.text);const media=/@media\b([^{};]*)\{/gi;let m:RegExpExecArray|null;
  while((m=media.exec(masked))){
   const headerStart=m.index+6;const query=files[region.file].slice(region.offset+headerStart,region.offset+m.index+m[0].length-1).trim();
   const widths=/\(\s*(min|max)-width\s*:\s*(\d+(?:\.\d+)?)\s*px\s*\)/gi;let w:RegExpExecArray|null;
   while((w=widths.exec(m[1]))){
    const token=w[0].search(/\d/);const start=region.offset+headerStart+w.index+token;const kind=w[1].toLowerCase() as 'min'|'max';
    const simple=/^\s*(?:all\s+and\s+)?\(\s*max-width\s*:\s*\d+(?:\.\d+)?\s*px\s*\)\s*$/i.test(m[1]);
    out.push({file:region.file,query,kind,width:Number(w[2]),start,end:start+w[2].length,line:files[region.file].slice(0,start).split('\n').length,canScope:simple&&Number.isInteger(Number(w[2]))&&Number(w[2])>=200&&Number(w[2])<=3840});
   }
  }
 }
 return out;
}
/** Reject stale offsets, invalid widths and missing sources rather than changing unrelated text. */
export function updateMediaWidth(files:Readonly<Record<string,string>>,entry:MediaWidth,value:string):string|null{
 if(!validMediaWidth(value))return null;
 const fresh=listMediaWidths(files).find(x=>x.file===entry.file&&x.start===entry.start&&x.end===entry.end&&x.query===entry.query&&x.width===entry.width);
 if(!fresh)return null;
 const source=files[entry.file];return source.slice(0,entry.start)+String(Number(value))+source.slice(entry.end);
}
export function appendMediaWidth(files:Readonly<Record<string,string>>,file:string,kind:'min'|'max',value:string):string|null{
 if(!isCss(file)||!(file in files)||!validMediaWidth(value)||!['min','max'].includes(kind))return null;
 if(listMediaWidths(files).some(x=>x.file===file&&x.kind===kind&&x.width===Number(value)&&x.query.replace(/\s/g,'')===`(${kind}-width:${Number(value)}px)`))return null;
 return files[file]+`\n@media (${kind}-width: ${Number(value)}px) {\n  /* Add responsive styles here. */\n}\n`;
}
/** Explicit scope overrides preview width. Auto retains the existing desktop/tablet/mobile mapping. */
export function resolveStyleBreakpoint(width:number,scope:'auto'|number|null):number|undefined{
 return scope==='auto'?(width>=1100?undefined:width>=700?900:600):scope??undefined;
}
