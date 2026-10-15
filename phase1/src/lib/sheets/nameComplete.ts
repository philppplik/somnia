import type {FunctionInfo,NameInfo,TableInfo} from './protocol';
/** Name completion for the formula bar: function and defined-name suggestions for the word at the caret. Read only. */
export interface Suggestion{label:string;insert:string;kind:'fn'|'name'|'table'|'sheet'|'column'}
export interface Completion{start:number;suggestions:Suggestion[]}
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
export interface NameSources{fns:readonly FunctionInfo[];names:readonly NameInfo[];tables:readonly TableInfo[];sheets:readonly string[]}
const PLAIN=/^[A-Za-z_][A-Za-z0-9_.]*$/;
/** A sheet name as a formula writes it: quoted when it is not a plain word or looks like a cell. */
export function sheetRef(name:string):string|null{
 if(name.length<1||name.length>31||/[\u0000-\u001f\u007f[\]:*?/\\]/.test(name))return null;
 return (PLAIN.test(name)&&!CELL_LIKE.test(name)?name:"'"+name.replace(/'/g,"''")+"'")+'!';
}
export function suggestNames(src:NameSources,word:string):Suggestion[]{
 if(word.length<2||CELL_LIKE.test(word))return [];
 const w=word.toUpperCase(),seen=new Set<string>();
 const pick=(items:readonly string[],kind:'name'|'table'|'sheet',max:number,make:(n:string)=>string|null)=>{
  const out:Suggestion[]=[];
  for(const n of items){const key=n.toUpperCase(),text=kind==='sheet'?n:n;if(!key.startsWith(w)||key===w||seen.has(kind+key))continue;const ins=make(text);if(!ins)continue;seen.add(kind+key);out.push({label:n,insert:ins,kind});}
  return out.sort((a,b)=>a.label.localeCompare(b.label)).slice(0,max);
 };
 const fns:Suggestion[]=[];
 for(const f of src.fns){if(f.name.startsWith(w)&&f.name!==w)fns.push({label:f.name,insert:f.name+'(',kind:'fn'});}
 fns.sort((a,b)=>a.label.localeCompare(b.label));
 const own=(n:string)=>PLAIN.test(n)?n:null;
 return [...pick(src.names.map(n=>n.name),'name',3,own),...pick(src.tables.map(t=>t.name),'table',3,own),...pick(src.sheets,'sheet',2,sheetRef),...fns].slice(0,MAX_SUGGESTIONS);
}
const COLUMN_SAFE=/^[^[\]#'@\u0000-\u001f\u007f]{1,255}$/;
/** After `Table1[` (outside quoted text): the table name and the column text typed so far; null otherwise. */
export function columnAtCaret(text:string,caret:number):{start:number;table:string;prefix:string}|null{
 if(!text.startsWith('=')||text.length>MAX_FORMULA_CHARS)return null;
 const end=Math.max(0,Math.min(caret,text.length));
 let i=1;
 while(i<end){const ch=text[i];if(ch==='"'||ch==="'"){i++;while(i<end){if(text[i]===ch){if(text[i+1]===ch){i+=2;continue;}break;}i++;}if(i>=end)return null;}i++;}
 const m=/([A-Za-z_][A-Za-z0-9_.]*)\[([^[\]'"#@]{0,64})$/.exec(text.slice(0,end));
 return m?{start:end-m[2].length,table:m[1],prefix:m[2]}:null;
}
export function suggestColumns(tables:readonly TableInfo[],table:string,prefix:string):Suggestion[]{
 const t=tables.find(x=>x.name.toUpperCase()===table.toUpperCase());if(!t?.columns)return [];
 const p=prefix.toUpperCase(),out:Suggestion[]=[];
 for(const c of t.columns){if(COLUMN_SAFE.test(c)&&c.toUpperCase().startsWith(p)&&c.toUpperCase()!==p)out.push({label:c,insert:c+']',kind:'column'});}
 return out.slice(0,MAX_SUGGESTIONS);
}
/** What the formula bar offers at the caret: columns inside `Table[`, otherwise names, tables, sheets and functions. */
export function completionAt(text:string,caret:number,src:NameSources):Completion|null{
 const col=columnAtCaret(text,caret);
 if(col){const suggestions=suggestColumns(src.tables,col.table,col.prefix);return suggestions.length?{start:col.start,suggestions}:null;}
 const word=wordAtCaret(text,caret);if(!word)return null;
 const suggestions=suggestNames(src,word.word);return suggestions.length?{start:word.start,suggestions}:null;
}
/** Replaces the word at the caret; a function gets its opening bracket unless one already follows. */
export function applySuggestion(text:string,start:number,caret:number,s:Suggestion):{text:string;caret:number}|null{
 if(start<1||start>caret||caret>text.length||!text.startsWith('='))return null;
 const okInsert=s.kind==='fn'?/^[A-Za-z_][A-Za-z0-9_.]*\($/.test(s.insert):s.kind==='column'?COLUMN_SAFE.test(s.insert.slice(0,-1))&&s.insert.endsWith(']'):s.kind==='sheet'?s.insert.endsWith('!')&&sheetRef(s.insert.slice(0,-1).replace(/^'(.*)'$/,(_,x:string)=>x.replace(/''/g,"'")))===s.insert:PLAIN.test(s.insert);
 if(!okInsert)return null;
 const rest=text.slice(caret),insert=s.kind==='fn'&&rest.startsWith('(')?s.insert.slice(0,-1):s.kind==='column'&&rest.startsWith(']')?s.insert.slice(0,-1):s.insert;
 const next=text.slice(0,start)+insert+rest;
 return next.length>MAX_FORMULA_CHARS?null:{text:next,caret:start+s.insert.length};
}
