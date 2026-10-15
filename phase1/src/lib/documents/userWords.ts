import {MAX_USER_WORDS,proofWordOk} from './protocol';
/** The user's own spelling words ("Add to dictionary"). Stored on this device only. */
export const USER_WORDS_KEY='somnia.documents.userWords';
const store=():Storage|null=>{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}};
/** The saved words: anything that is not a valid word is dropped, duplicates (ignoring case) are merged, at most 1000 are kept. */
export function parseUserWords(raw:string|null):string[]{
 if(!raw||raw.length>200_000)return[];
 let v:unknown;try{v=JSON.parse(raw);}catch{return[];}
 if(!Array.isArray(v))return[];
 const seen=new Set<string>(),out:string[]=[];
 for(const w of v){if(out.length>=MAX_USER_WORDS)break;if(!proofWordOk(w))continue;const k=w.toLowerCase();if(seen.has(k))continue;seen.add(k);out.push(w);}
 return out;
}
export const savedUserWords=():string[]=>{try{return parseUserWords(store()?.getItem(USER_WORDS_KEY)??null);}catch{return[];}};
/** Adds a word. False when it is not a valid word, the list is full, or storage is unavailable; true when added or already there. */
export function addUserWord(word:string):boolean{
 if(!proofWordOk(word))return false;
 const cur=savedUserWords();if(cur.some(w=>w.toLowerCase()===word.toLowerCase()))return true;
 if(cur.length>=MAX_USER_WORDS)return false;
 try{const s=store();if(!s)return false;s.setItem(USER_WORDS_KEY,JSON.stringify([...cur,word]));return true;}catch{return false;}
}
