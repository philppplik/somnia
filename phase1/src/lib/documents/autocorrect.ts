/** AutoCorrect while typing: smart quotes and a few symbol shortcuts. Pure text logic plus one saved on/off switch. */
const KEY='somnia.documents.autocorrect';
const store=():Storage|null=>{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}};
export const autoCorrectOn=():boolean=>{try{return store()?.getItem(KEY)!=='off';}catch{return true;}};
export function setAutoCorrect(on:boolean):boolean{try{const s=store();if(!s)return false;if(on)s.removeItem(KEY);else s.setItem(KEY,'off');return true;}catch{return false;}}
const TOKENS:Record<string,string>={'(c)':'\u00a9','(r)':'\u00ae','(tm)':'\u2122','--':'\u2013','...':'\u2026','->':'\u2192','<-':'\u2190','=>':'\u21d2','1/2':'\u00bd','1/4':'\u00bc','3/4':'\u00be'};
const TRIGGERS=' .,;:!?';
const enc=new TextEncoder();
const bytes=(s:string)=>enc.encode(s).length;
export type Correction={start:number;end:number;text:string};
/**
 * The edit that replaces the caret range with what was typed, plus any correction. `text` is the whole block, `caret` a UTF-8 byte offset,
 * `typed` one typed character. Returns null when nothing is corrected, so the caller inserts the character as usual.
 * Offsets are UTF-8 bytes, matching the engine.
 */
export function autoCorrect(text:string,caret:number,typed:string):Correction|null{
 if([...typed].length!==1||!Number.isInteger(caret)||caret<0)return null;
 let idx=0,b=0;for(const ch of text){if(b>=caret)break;b+=bytes(ch);idx+=ch.length;}
 if(b!==caret)return null;
 const before=text.slice(0,idx);
 if(typed==='"'||typed==="'"){
  const prev=before.slice(-1);const open=prev===''||/[\s([{\u2013\u2014]/.test(prev);
  const q=typed==='"'?(open?'\u201c':'\u201d'):(open?'\u2018':'\u2019');
  return {start:caret,end:caret,text:q};
 }
 if(!TRIGGERS.includes(typed))return null;
 const ws=Math.max(before.lastIndexOf(' '),before.lastIndexOf('\t'),before.lastIndexOf('\n'));
 const word=before.slice(ws+1);if(!word||word.length>4)return null;
 const rep=TOKENS[word.toLowerCase()];if(!rep)return null;
 if(typed==='.'&&word==='..')return null;
 return {start:caret-bytes(word),end:caret,text:rep+typed};
}
