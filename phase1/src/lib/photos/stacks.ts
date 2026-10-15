/** Photo stacks (bursts/series grouped in the strip), keyed by media name and persisted locally. Photos-only: the shared media model stays untouched. */
import {useSyncExternalStore} from 'react';
const KEY='somnia.photos.stacks.v1';
let counter=0;
const newId=()=>`st${Date.now().toString(36)}${(counter++).toString(36)}`;
let state:Record<string,string>={}; // photo name -> stack id
try{const d=JSON.parse(globalThis.localStorage?.getItem(KEY)??'null');if(d&&typeof d==='object'&&!Array.isArray(d))for(const[k,v]of Object.entries(d))if(typeof v==='string'&&v)state[k]=v;}catch{/* session only */}
const subs=new Set<()=>void>();
const notify=()=>subs.forEach(f=>f());
export const getStack=(name:string):string|null=>state[name]??null;
export const photoStacks=():Readonly<Record<string,string>>=>state;
export const stackMembers=(id:string):string[]=>Object.keys(state).filter(n=>state[n]===id);
function persist(){try{globalThis.localStorage?.setItem(KEY,JSON.stringify(state));}catch{/* session only */}notify();}
/** Groups the names into one stack; a name already stacked pulls the rest into its stack. Returns the stack id. */
export function groupPhotos(names:readonly string[]):string|null{
 const list=names.filter(Boolean);if(list.length<2)return null;
 const id=list.map(n=>state[n]).find(Boolean)??newId();
 state={...state};for(const n of list)state[n]=id;
 persist();return id;
}
/** Drops every member of the given stacks. */
export function ungroupStacks(ids:readonly string[]){
 const drop=new Set(ids);if(drop.size===0)return;
 state=Object.fromEntries(Object.entries(state).filter(([,id])=>!drop.has(id)));
 persist();
}
export const subscribeStacks=(fn:()=>void)=>{subs.add(fn);return()=>{subs.delete(fn);};};
export const useStacks=()=>useSyncExternalStore(subscribeStacks,photoStacks,photoStacks);
export type StripRow={kind:'single';name:string}|{kind:'stack';id:string;members:string[]};
/** Walks the visible strip order: consecutive members of one stack collapse into a stack row unless that stack is expanded. */
export function groupForStrip(ordered:readonly string[],stacks:Readonly<Record<string,string>>,expanded:Readonly<Record<string,boolean>>):StripRow[]{
 const out:StripRow[]=[];let i=0;
 while(i<ordered.length){
  const id=stacks[ordered[i]];
  if(!id||expanded[id]){out.push({kind:'single',name:ordered[i]});i++;continue;}
  const members:string[]=[];
  while(i<ordered.length&&stacks[ordered[i]]===id){members.push(ordered[i]);i++;}
  if(members.length<2)out.push({kind:'single',name:members[0]});
  else out.push({kind:'stack',id,members});
 }
 return out;
}
