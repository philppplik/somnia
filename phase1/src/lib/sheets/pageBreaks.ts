/** Page breaks overview: validation of command input and of the bridge answer (display only). */
export const MAX_PAGES_LISTED=500;
export interface PageInfo{page:number;range:string;rows:string;columns:string;scale:number;paper:string;orientation:string}
export interface PageList{pages:PageInfo[];total:number}
export function parsePagesCommand(input:unknown):{kind:'show'|'clear'}{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Pages must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>k!=='kind'))throw Error('Unknown pages field.');
 if(o.kind!=='show'&&o.kind!=='clear')throw Error('Unsupported pages action.');return {kind:o.kind};
}
const str=(v:unknown,max:number)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u001f\u007f]/.test(v))throw Error('Invalid page text.');return v;};
const int=(v:unknown,max:number)=>{if(typeof v!=='number'||!Number.isInteger(v)||v<0||v>max)throw Error('Invalid page count.');return v;};
export function parsePageList(input:unknown):PageList{
 if(!input||typeof input!=='object')throw Error('Invalid page list.');const o=input as Record<string,unknown>;
 if(!Array.isArray(o.pages)||o.pages.length>MAX_PAGES_LISTED)throw Error('Invalid page list.');
 return {total:int(o.total,1e7),pages:o.pages.map(p=>{if(!p||typeof p!=='object')throw Error('Invalid page.');const x=p as Record<string,unknown>;
  if(typeof x.scale!=='number'||!Number.isFinite(x.scale)||x.scale<0||x.scale>1000)throw Error('Invalid page scale.');
  return {page:int(x.page,1e7),range:str(x.range,40),rows:str(x.rows,24),columns:str(x.columns,24),scale:x.scale,paper:str(x.paper,24),orientation:str(x.orientation,12)};})};
}
/** The cell a page starts at, to jump to: the first cell of its range. */
export const pageStart=(range:string)=>range.split(':')[0];
