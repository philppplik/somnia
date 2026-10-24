import {buildPattern,type SearchOptions} from './projectSearch';
export interface ReplaceOccurrence {id:number;file:string;from:number;to:number;before:string;after:string;line:number;column:number}
/** JavaScript replacement tokens, preserving optional capture slots and named groups. */
function substitution(replacement:string,match:string,captures:(string|undefined)[],groups:Record<string,string|undefined>|undefined,raw:string,offset:number){
 return replacement.replace(/\$(\$|&|`|'|[0-9]{1,2}|<[^>]*>)/g,(token,key:string)=>{
  if(key==='$')return '$';if(key==='&')return match;if(key==='`')return raw.slice(0,offset);if(key==="'")return raw.slice(offset+match.length);
  if(key.startsWith('<'))return groups===undefined?token:groups[key.slice(1,-1)]??'';
  const n=Number(key);if(n>0&&n<=captures.length)return captures[n-1]??'';
  if(key.length===2&&Number(key[0])>0&&Number(key[0])<=captures.length)return (captures[Number(key[0])-1]??'')+key[1];return token;
 });
}
export function collectReplaceOccurrences(files:Record<string,string>,query:string,replacement:string,options:SearchOptions):ReplaceOccurrence[]{
 const pattern=buildPattern(query,options);if(!pattern||'error' in pattern)return [];const rows:ReplaceOccurrence[]=[];let budget=0;
 for(const file of Object.keys(files).sort()){const raw=files[file];pattern.lastIndex=0;const lineStarts=[0];for(let i=0;i<raw.length;i++)if(raw[i]==='\n')lineStarts.push(i+1);
  raw.replace(pattern,(match:string,...args:unknown[])=>{const named=typeof args.at(-1)==='object'?args.pop() as Record<string,string|undefined>:undefined;args.pop();const offset=args.pop() as number,captures=args as (string|undefined)[];
   if(!match.length)throw Error('zero-width-replace');const after=options.regex?substitution(replacement,match,captures,named,raw,offset):replacement;
   if(after===match)return match;budget+=new TextEncoder().encode(after+match).length;if(budget>512*1024)throw Error('review-limit');if(rows.length>=2000)throw Error('review-limit');
   let low=0,high=lineStarts.length;while(low+1<high){const mid=(low+high)>>1;if(lineStarts[mid]<=offset)low=mid;else high=mid;}
   rows.push({id:rows.length,file,from:offset,to:offset+match.length,before:match,after,line:low+1,column:offset-lineStarts[low]+1});return match;
  });
 }return rows;
}
/** Build the exact after for selected occurrence IDs. Unknown/duplicate IDs fail closed. */
export function selectedReplacement(files:Record<string,string>,occurrences:readonly ReplaceOccurrence[],selected:readonly number[]):{changed:Record<string,string>;count:number}{
 const ids=new Set(selected);if(ids.size!==selected.length||[...ids].some(id=>!Number.isInteger(id)||!occurrences.some(row=>row.id===id)))throw Error('selection-invalid');
 const changed:Record<string,string>={};let bytes=0;for(const file of new Set(occurrences.filter(row=>ids.has(row.id)).map(row=>row.file))){if(!Object.hasOwn(files,file))throw Error('selection-stale');let text=files[file];if(new TextEncoder().encode(text).length>512*1024)throw Error('review-limit');const rows=occurrences.filter(row=>row.file===file&&ids.has(row.id)).sort((a,b)=>b.from-a.from);let boundary=text.length;
  for(const row of rows){if(row.from<0||row.to>boundary||row.to<=row.from||text.slice(row.from,row.to)!==row.before)throw Error('selection-stale');text=text.slice(0,row.from)+row.after+text.slice(row.to);boundary=row.from;}
  if(text!==files[file]){bytes+=new TextEncoder().encode(files[file]+text).length;if(bytes>512*1024)throw Error('review-limit');changed[file]=text;}
 }return {changed,count:ids.size};
}
