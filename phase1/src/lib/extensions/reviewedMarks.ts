/** Persists the index maintainer-review mark at install/update time so the Installed view can show
 * the same badge the Store showed for that exact version. A mark is evidence about the index entry,
 * never about the code being safe, and it is only shown for the installed version it was recorded for. */
export interface ReviewedMark {reviewer:string}
export const REVIEWED_MARKS_KEY='somnia.extensions.reviewed.v1';
const MAX_MARKS=500;
export interface MarkStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem?(key:string):void}
const key=(id:string,version:string)=>`${id}@${version}`;
function read(storage:MarkStorage):Record<string,ReviewedMark>{
 try{
  const v=JSON.parse(storage.getItem(REVIEWED_MARKS_KEY)||'{}');
  if(!v||typeof v!=='object'||Array.isArray(v))return{};
  const out:Record<string,ReviewedMark>={};
  for(const [k,m] of Object.entries(v as Record<string,unknown>)){
   if(m&&typeof m==='object'&&!Array.isArray(m)&&typeof (m as ReviewedMark).reviewer==='string'&&(m as ReviewedMark).reviewer.trim()&&(m as ReviewedMark).reviewer.length<=80)out[k]={reviewer:(m as ReviewedMark).reviewer};
  }
  return out;
 }catch{return{};}
}
function write(storage:MarkStorage,all:Record<string,ReviewedMark>):void{storage.setItem(REVIEWED_MARKS_KEY,JSON.stringify(all));}
/** The recorded mark for exactly this installed version, or null. */
export function reviewedMarkFor(id:string,version:string,storage:MarkStorage=localStorage):ReviewedMark|null{
 return read(storage)[key(id,version)]??null;
}
/** Called only after a store/catalog install or update of a reviewed entry is committed. */
export function recordReviewedMark(id:string,version:string,reviewer:string,storage:MarkStorage=localStorage):void{
 const all=read(storage);
 if(!(key(id,version) in all)&&Object.keys(all).length>=MAX_MARKS)return;
 all[key(id,version)]={reviewer:reviewer.slice(0,80)};
 write(storage,all);
}
/** All marks of one extension go with the extension. Other versions keep theirs. */
export function clearReviewedMarks(id:string,storage:MarkStorage=localStorage):void{
 const all=read(storage);const prefix=`${id}@`;
 let changed=false;
 for(const k of Object.keys(all))if(k.startsWith(prefix)){delete all[k];changed=true;}
 if(changed)write(storage,all);
}
