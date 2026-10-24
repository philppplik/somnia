/** One undo history over the culling metadata stores (rating, flag, color label, tags, caption). Components call the wrapped setters (or cullBatch for multi-target actions); Ctrl+Z / Ctrl+Shift+Z in the workspace walk the stack. Caption typing coalesces into one entry. Develop-settings undo is a separate history (the workspace buttons) - deliberately not mixed. */
import {useSyncExternalStore} from 'react';
import {getRating,setRating} from './ratings';
import {getFlag,setFlag,type PhotoFlag} from './flags';
import {getLabel,setLabel,type PhotoLabel} from './labels';
import {getTags,setTags,addTags} from './tags';
import {getCaption,setCaption} from './captions';
export type CullField='rating'|'flag'|'label'|'tags'|'caption';
type CullValue=number|PhotoFlag|null|PhotoLabel|readonly string[]|string;
interface CullChange{name:string;field:CullField;before:CullValue;after:CullValue}
interface CullEntry{time:number;key:string;changes:CullChange[]}
const MAX_ENTRIES=200;
const COALESCE_MS=1200;
let undoStack:CullEntry[]=[];
let redoStack:CullEntry[]=[];
let batch:CullEntry[]|null=null;
let suspended=false;
const subs=new Set<()=>void>();
const notify=()=>subs.forEach(f=>f());
const write=(name:string,field:CullField,v:CullValue)=>{
 if(field==='rating')setRating(name,v as number);
 else if(field==='flag')setFlag(name,v as PhotoFlag|null);
 else if(field==='label')setLabel(name,v as PhotoLabel|null);
 else if(field==='tags')setTags(name,v as readonly string[]);
 else setCaption(name,v as string);
};
const same=(a:CullValue,b:CullValue)=>Array.isArray(a)||Array.isArray(b)?JSON.stringify(a)===JSON.stringify(b):a===b;
function record(name:string,field:CullField,before:CullValue,after:CullValue){
 if(suspended||!name)return;
 if(same(before,after))return;
 const change:CullChange={name,field,before,after};
 if(batch){batch.push({time:Date.now(),key:`${field}:${name}`,changes:[change]});return;}
 const top=undoStack[undoStack.length-1];
 const key=`${field}:${name}`;
 if(field==='caption'&&top&&top.key===key&&Date.now()-top.time<COALESCE_MS){ // caption typing = one entry
  top.time=Date.now();
  top.changes=[{name,field,before:top.changes[0].before,after}];
 }else{
  undoStack.push({time:Date.now(),key,changes:[change]});
  if(undoStack.length>MAX_ENTRIES)undoStack.shift();
 }
 redoStack=[];
 notify();
}
/** Group every wrapped mutation inside fn into one undo entry (selection-batched culling, metadata paste). */
export function cullBatch(fn:()=>void){
 const prev=batch;
 batch=[];
 try{fn();}finally{
  const entries=batch;
  batch=prev;
  const changes=entries.flatMap(e=>e.changes);
  if(changes.length){
   undoStack.push({time:Date.now(),key:'batch',changes});
   if(undoStack.length>MAX_ENTRIES)undoStack.shift();
   redoStack=[];
   notify();
  }
 }
}
export const cullSetRating=(name:string,r:number)=>{const before=getRating(name);setRating(name,r);record(name,'rating',before,r);};
export const cullSetFlag=(name:string,f:PhotoFlag|null)=>{const before=getFlag(name);setFlag(name,f);record(name,'flag',before,f);};
export const cullSetLabel=(name:string,l:PhotoLabel|null)=>{const before=getLabel(name);setLabel(name,l);record(name,'label',before,l);};
export const cullSetTags=(name:string,t:readonly unknown[])=>{const before=[...getTags(name)];setTags(name,t);record(name,'tags',before,[...getTags(name)]);};
export const cullAddTags=(name:string,t:readonly unknown[])=>{const before=[...getTags(name)];addTags(name,t);record(name,'tags',before,[...getTags(name)]);};
export const cullSetCaption=(name:string,c:string)=>{const before=getCaption(name);setCaption(name,c);record(name,'caption',before,getCaption(name));};
const apply=(entries:CullChange[],dir:'before'|'after')=>{suspended=true;try{for(const c of entries)write(c.name,c.field,c[dir]);}finally{suspended=false;}};
export const canUndoCull=()=>undoStack.length>0;
export const canRedoCull=()=>redoStack.length>0;
export function undoCull():boolean{
 const e=undoStack.pop();
 if(!e)return false;
 apply(e.changes,'before');
 redoStack.push(e);
 notify();
 return true;
}
export function redoCull():boolean{
 const e=redoStack.pop();
 if(!e)return false;
 apply(e.changes,'after');
 undoStack.push(e);
 notify();
 return true;
}
const state=()=>({u:undoStack.length,r:redoStack.length});
let cached=state();
const snapshot=()=>{const s=state();if(s.u!==cached.u||s.r!==cached.r)cached=s;return cached;};
export const subscribeCullHistory=(fn:()=>void)=>{subs.add(fn);return()=>{subs.delete(fn);};};
export const useCullHistory=()=>useSyncExternalStore(subscribeCullHistory,snapshot,snapshot);
