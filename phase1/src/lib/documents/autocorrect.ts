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

export interface AutoLink{start:number;end:number;url:string}
/** Characters that end a sentence, not an address, when they trail a pasted or typed URL. */
const TRAIL=/[.,;:!?)\]}'"\u2019\u201d]+$/;
/**
 * The link to make when `typed` (a space) is typed after a web address or e-mail address: returns the byte range of the address (without trailing
 * punctuation) and its link target, or null. Addresses starting with http://, https:// or www. and plain e-mail addresses count; the result always passes the link check.
 */
export function autoLink(text:string,caret:number,typed:string):AutoLink|null{
 if(typed!==' '||!Number.isInteger(caret)||caret<0)return null;
 let idx=0,b=0;for(const ch of text){if(b>=caret)break;b+=bytes(ch);idx+=ch.length;}
 if(b!==caret)return null;
 const before=text.slice(0,idx);const ws=Math.max(before.lastIndexOf(' '),before.lastIndexOf('\t'),before.lastIndexOf('\n'),before.lastIndexOf('\u00a0'));
 let word=before.slice(ws+1).replace(TRAIL,'');if(!word||word.length>2000)return null;
 let url:string|null=null;
 if(/^https?:\/\/[^\s/?#]+\.[^\s]{1,}$/i.test(word)||/^https?:\/\/localhost(:\d+)?([/?#]\S*)?$/i.test(word))url=word;
 else if(/^www\.[^\s/?#.]+\.[^\s]+$/i.test(word))url='https://'+word;
 else if(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(word))url='mailto:'+word;
 if(url===null||Array.from(url).length>2000||/[\u0000-\u001f\u007f-\u009f\s]/.test(url))return null;
 const start=caret-bytes(before.slice(ws+1));
 return {start,end:start+bytes(word),url};
}
