import type {FunctionInfo,NameInfo} from './protocol';
/** Name completion for the formula bar: function and defined-name suggestions for the word at the caret. Read only. */
export interface Suggestion{label:string;insert:string;kind:'fn'|'name'}
export const MAX_SUGGESTIONS=12;
const MAX_FORMULA_CHARS=8192;
const CELL_LIKE=/^[A-Za-z]{1,3}[0-9]+$/;
/** The identifier that ends at the caret, outside any quoted text; null when there is none. */
export function wordAtCaret(text:string,caret:number):{start:number;word:string}|null{
 if(!text.startsWith('=')||text.length>MAX_FORMULA_CHARS)return null;
 const end=Math.max(0,Math.min(caret,text.length));
 let i=1;
 while(i<end){const ch=text[i];if(ch==='"'||ch==="'"){i++;while(i<end){if(text[i]===ch){if(text[i+1]===ch){i+=2;continue;}break;}i++;}if(i>=end)return null;}i++;}
 const m=/[A-Za-z_][A-Za-z0-9_.]*$/.exec(text.slice(0,end));if(!m)return null;
 const start=end-m[0].length,prev=start>0?text[start-1]:'';
 if(start===0||/[0-9.$!'"]/.test(prev))return null;
 return {start,word:m[0]};
}
export function suggestNames(fns:readonly FunctionInfo[],names:readonly NameInfo[],word:string):Suggestion[]{
 if(word.length<2||CELL_LIKE.test(word))return [];
 const w=word.toUpperCase(),out:Suggestion[]=[],seen=new Set<string>();
 for(const f of fns){if(f.name.startsWith(w)&&f.name!==w){out.push({label:f.name,insert:f.name+'(',kind:'fn'});}}
 out.sort((a,b)=>a.label.localeCompare(b.label));
 const fnPart=out.slice(0,MAX_SUGGESTIONS);
 const nm:Suggestion[]=[];
 for(const n of names){const key=n.name.toUpperCase();if(key.startsWith(w)&&key!==w&&!seen.has(key)&&/^[A-Za-z_][A-Za-z0-9_.]*$/.test(n.name)){seen.add(key);nm.push({label:n.name,insert:n.name,kind:'name'});}}
 nm.sort((a,b)=>a.label.localeCompare(b.label));
 return [...nm.slice(0,Math.min(nm.length,4)),...fnPart].slice(0,MAX_SUGGESTIONS);
}
/** Replaces the word at the caret; a function gets its opening bracket unless one already follows. */
export function applySuggestion(text:string,start:number,caret:number,s:Suggestion):{text:string;caret:number}|null{
 if(start<1||start>caret||caret>text.length||!text.startsWith('=')||!/^[A-Za-z_][A-Za-z0-9_.]*\(?$/.test(s.insert))return null;
 const rest=text.slice(caret),insert=s.kind==='fn'&&rest.startsWith('(')?s.insert.slice(0,-1):s.insert;
 const next=text.slice(0,start)+insert+rest;
 return next.length>MAX_FORMULA_CHARS?null:{text:next,caret:start+s.insert.length};
}
