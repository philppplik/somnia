import {utf16ToUtf8Offset} from './text';
/** Bounds for find and replace. */
export const MAX_FIND_QUERY=200,MAX_REPLACE_TEXT=1000,MAX_FIND_MATCHES=5000,MAX_FIND_HIGHLIGHTS=300,MAX_REPLACE_BLOCKS=500;
export interface FindOptions{matchCase:boolean;wholeWord:boolean}
export interface FindMatch{block:number;start:number;end:number}
export interface FindResult{matches:FindMatch[];capped:boolean}
export const validFindQuery=(q:unknown):q is string=>typeof q==='string'&&q.length>0&&Array.from(q).length<=MAX_FIND_QUERY&&!/[\r\n\uFFFC]/.test(q);
export const validReplaceText=(r:unknown):r is string=>typeof r==='string'&&Array.from(r).length<=MAX_REPLACE_TEXT&&!/[\r\n\uFFFC]/.test(r);
const esc=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/**
 * All non-overlapping matches of `query` in the editable paragraphs, in document order, as UTF-8 byte ranges of each paragraph's text.
 * Case folding is simple (length preserving). Whole word means no letter, digit or underscore touches either end.
 * Stops at MAX_FIND_MATCHES and says so.
 */
export function findMatches(texts:readonly {index:number;text:string}[],query:string,o:FindOptions):FindResult{
 if(!validFindQuery(query))return{matches:[],capped:false};
 const W='[\\p{L}\\p{N}_]';
 const re=new RegExp((o.wholeWord?`(?<!${W})`:'')+esc(query)+(o.wholeWord?`(?!${W})`:''),o.matchCase?'gu':'giu');
 const matches:FindMatch[]=[];
 for(const p of texts){
  for(const m of p.text.matchAll(re)){
   if(matches.length>=MAX_FIND_MATCHES)return{matches,capped:true};
   const i=m.index??0;matches.push({block:p.index,start:utf16ToUtf8Offset(p.text,i),end:utf16ToUtf8Offset(p.text,i+m[0].length)});
  }
 }
 return{matches,capped:false};
}
/** Word count and characters (with and without spaces) of a text; words are runs of non-space characters. */
export function textStats(text:string):{words:number;chars:number;charsNoSpaces:number}{
 const chars=Array.from(text.replace(/\n/g,'')).length;
 return{words:text.split(/\s+/).filter(Boolean).length,chars,charsNoSpaces:Array.from(text.replace(/\s/g,'')).length};
}
/** The index of the first match that starts at or after (block, off), wrapping to 0; -1 when there are none. */
export function nextMatchIndex(ms:readonly FindMatch[],block:number,off:number,dir:1|-1):number{
 if(ms.length===0)return -1;
 if(dir>0){const i=ms.findIndex(m=>m.block>block||(m.block===block&&m.start>=off));return i<0?0:i;}
 for(let i=ms.length-1;i>=0;i--){const m=ms[i];if(m.block<block||(m.block===block&&m.start<off))return i;}
 return ms.length-1;
}
