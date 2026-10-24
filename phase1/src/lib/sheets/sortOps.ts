import type {SortOp} from './protocol';
/** Sorting: validation for untrusted command input. The Rust bridge and the engine re-validate every field. */
export const MAX_SORT_KEYS=3,MAX_SORT_CELLS=1_000_000;
/** True when the block is large enough to sort (two rows, and a body row below a header). */
export function sortBlockProblem(rows:number,cols:number,header:boolean):'small'|'large'|'header'|null{
 if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<2||cols<1)return 'small';
 if(rows*cols>MAX_SORT_CELLS)return 'large';
 if(header&&rows<3)return 'header';return null;
}
/** Guess whether the first row is a header: text over a column that holds a number below it. Only a default; the user decides. */
export function guessHeader(first:readonly string[],second:readonly string[]):boolean{
 const num=(v:string)=>v.trim()!==''&&Number.isFinite(Number(v.replace(/,/g,'')));
 return first.some((v,i)=>v.trim()!==''&&!num(v)&&num(second[i]??''))&&!first.some(num);
}
export const MAX_SORT_LIST=50,MAX_SORT_LIST_ITEM=64;
/** Panel text "Low, Medium, High" into a custom order; null when empty, too long, with a control character or a repeated entry. */
export function parseListText(text:string):string[]|null{
 const items=text.split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
 if(items.length<1||items.length>MAX_SORT_LIST||items.some(x=>x.length>MAX_SORT_LIST_ITEM||/[\u0000-\u001f\u007f]/.test(x)))return null;
 return new Set(items.map(x=>x.toLowerCase())).size===items.length?items:null;
}
export type SortPreset='weekdays'|'weekdaysShort'|'months'|'monthsShort';
/** Day or month names in the UI language, Monday first, as a custom order; null when the language is not known to Intl. */
export function presetList(kind:SortPreset,locale:string):string[]|null{
 try{
  const weekday=kind==='weekdays'||kind==='weekdaysShort',n=weekday?7:12,style=kind.endsWith('Short')?'short':'long';
  const fmt=new Intl.DateTimeFormat(locale,weekday?{weekday:style,timeZone:'UTC'}:{month:style,timeZone:'UTC'});
  const out=Array.from({length:n},(_,i)=>fmt.format(new Date(Date.UTC(2024,weekday?0:i,weekday?1+i:1))).trim());
  return parseListText(out.join('\n'));
 }catch{return null;}
}
export function parseSortCommand(input:unknown,cols?:number):SortOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Sort must be an object.');
 const o=input as Record<string,unknown>,multi=o.keys!==undefined;
 if(Object.keys(o).some(k=>!(multi?['keys','header','matchCase','orientation']:['column','order','header']).includes(k)))throw Error('Unknown sort field.');
 if(typeof o.header!=='boolean')throw Error('Header must be true or false.');
 const key=(v:unknown)=>{
  if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid sort key.');
  const k=v as Record<string,unknown>;if(Object.keys(k).some(x=>!['column','order','list'].includes(x)))throw Error('Unknown sort field.');
  if(typeof k.column!=='number'||!Number.isInteger(k.column)||k.column<0||k.column>=16384||(cols!==undefined&&k.column>=cols))throw Error('Invalid sort column.');
  if(k.order!=='asc'&&k.order!=='desc')throw Error('Sort order must be asc or desc.');
  const out:SortOp['keys'][number]={column:k.column,order:k.order};
  if(k.list!==undefined){if(!Array.isArray(k.list)||k.list.some(x=>typeof x!=='string'))throw Error('The custom order must be a list of texts.');const l=parseListText(k.list.join('\n'));if(!l||l.length!==k.list.length)throw Error('Invalid custom order.');out.list=l;}
  return out;
 };
 if(!multi)return {header:o.header,keys:[key({column:o.column,order:o.order})]};
 if(!Array.isArray(o.keys)||o.keys.length<1||o.keys.length>MAX_SORT_KEYS)throw Error('Sort by 1 to 3 columns.');
 const keys=o.keys.map(key);if(new Set(keys.map(k=>k.column)).size!==keys.length)throw Error('Each column can be used once.');
 if(o.matchCase!==undefined&&typeof o.matchCase!=='boolean')throw Error('Match case must be true or false.');
 if(o.orientation!==undefined&&o.orientation!=='rows'&&o.orientation!=='columns')throw Error('The direction must be rows or columns.');
 return {header:o.header,keys,...(o.matchCase===true?{matchCase:true}:{}),...(o.orientation==='columns'?{orientation:'columns' as const}:{})};
}
