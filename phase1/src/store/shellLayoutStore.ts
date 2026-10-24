import {useSyncExternalStore} from 'react';
import type {PanelDef,ShellLayoutEntry,StudioLayout} from '../lib/shell/types';
export type PersistedShellLayoutEntry=ShellLayoutEntry&{collapsedPanels?:string[]};
const KEY='somnia.shellLayout.v1';
const emptyOverrides=()=>({order:[],pinned:[],hidden:[],unpinned:[]});
const strings=(x:unknown)=>Array.isArray(x)?[...new Set(x.filter((i):i is string=>typeof i==='string'))]:[];
const width=(x:unknown,min:number,max:number,fallback:number)=>typeof x==='number'&&Number.isFinite(x)?Math.max(min,Math.min(max,x)):fallback;
/** Missing or obsolete stacks fall back to the studio defaults. Explicitly empty stacks stay empty. */
export function sanitizeShellLayout(input:unknown,defaults:StudioLayout,panels:readonly PanelDef[]):PersistedShellLayoutEntry{
 const x=(input&&typeof input==='object'?input:defaults) as Partial<PersistedShellLayoutEntry>;
 const ids=(side:'left'|'right')=>new Set(panels.filter(p=>p.side===side).map(p=>p.id));
 const clean=(list:unknown,side:'left'|'right')=>strings(list).filter(id=>ids(side).has(id));
 const stack=(side:'left'|'right')=>{
  const key=side==='left'?'leftPanels':'rightPanels',list=x[key],valid=clean(list,side);
  // A nonempty obsolete stack is not a user closing all panels. An explicit [] is.
  return !Array.isArray(list)||(list.length>0&&!valid.length)?clean(defaults[key],side):valid;
 };
 const leftPanels=stack('left'),rightPanels=stack('right');
 const ov=x.railOverrides;
 return {leftOpen:typeof x.leftOpen==='boolean'?x.leftOpen:defaults.leftOpen,rightOpen:typeof x.rightOpen==='boolean'?x.rightOpen:defaults.rightOpen,
 leftWidth:width(x.leftWidth,220,380,defaults.leftWidth),rightWidth:width(x.rightWidth,280,400,defaults.rightWidth),leftPanels,rightPanels,
 activeLeft:leftPanels.includes(x.activeLeft??'')?x.activeLeft:leftPanels[0],activeRight:rightPanels.includes(x.activeRight??'')?x.activeRight:rightPanels[0],
 collapsedPanels:strings(x.collapsedPanels).filter(id=>leftPanels.includes(id)||rightPanels.includes(id)),
 railOverrides:ov?{order:strings(ov.order),pinned:strings(ov.pinned),hidden:strings(ov.hidden),unpinned:strings(ov.unpinned)}:emptyOverrides()};
}
export interface LayoutStorage{getItem(key:string):string|null;setItem(key:string,value:string):void;}
/** Storage is injected in tests. Unavailable storage never breaks editing. */
export function createShellLayoutStore(storage?:LayoutStorage){
 let saved:Record<string,unknown>={};try{const data=JSON.parse(storage?.getItem(KEY)??'null');if(data?.version===1&&data.layouts&&typeof data.layouts==='object'&&!Array.isArray(data.layouts))saved=data.layouts;}catch{/* session only */}
 let state:Record<string,PersistedShellLayoutEntry>={};const listeners=new Set<()=>void>();
 const publish=()=>{try{storage?.setItem(KEY,JSON.stringify({version:1,layouts:{...saved,...state}}));}catch{/* session only */}listeners.forEach(fn=>fn());};
 const restore=(id:string,defaults:StudioLayout,panels:readonly PanelDef[])=>{
  let input=saved[id];
  // Before shell v2 Code's right tabs were design/prototype/code. They now share one inspector.
  if(id==='code'&&input&&typeof input==='object'&&panels.some(p=>p.id==='inspector'&&p.side==='right')){
   const x=input as Partial<PersistedShellLayoutEntry>;
   const panelId=(value:string)=>['design','prototype','code'].includes(value)&&!panels.some(p=>p.id===value&&p.side==='right')?'inspector':value;
   input={...x,...(Array.isArray(x.rightPanels)?{rightPanels:x.rightPanels.map(panelId)}:{}),
    ...(typeof x.activeRight==='string'?{activeRight:panelId(x.activeRight)}:{}),
    ...(Array.isArray(x.collapsedPanels)?{collapsedPanels:x.collapsedPanels.map(panelId)}:{})};
  }
  return sanitizeShellLayout(input,defaults,panels);
 };
 const get=(id:string,defaults:StudioLayout,panels:readonly PanelDef[])=>state[id]??(state={...state,[id]:restore(id,defaults,panels)})[id];
 return {get,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
 update(id:string,patch:Partial<PersistedShellLayoutEntry>,defaults:StudioLayout,panels:readonly PanelDef[]){const current=get(id,defaults,panels);state={...state,[id]:sanitizeShellLayout({...current,...patch},defaults,panels)};publish();return state[id];},
 reset(id:string,defaults:StudioLayout,panels:readonly PanelDef[]){state={...state,[id]:sanitizeShellLayout(undefined,defaults,panels)};publish();return state[id];}
 };
}
let storage:LayoutStorage|undefined;try{storage=globalThis.localStorage;}catch{/* unavailable */}
export const shellLayoutStore=createShellLayoutStore(storage);
export function useShellLayout(id:string,defaults:StudioLayout,panels:readonly PanelDef[]){return useSyncExternalStore(shellLayoutStore.subscribe,()=>shellLayoutStore.get(id,defaults,panels),()=>shellLayoutStore.get(id,defaults,panels));}
export function editPanelStack(layout:ShellLayoutEntry,side:'left'|'right',id:string,action:'open'|'close'|'focus'|'toggle',to?:number):Partial<ShellLayoutEntry>{
 const key=side==='left'?'leftPanels':'rightPanels',active=side==='left'?'activeLeft':'activeRight',open=side==='left'?'leftOpen':'rightOpen';
 let panels=[...layout[key]];if(action==='close')panels=panels.filter(p=>p!==id);else if(!panels.includes(id))panels.push(id);
 if(to!==undefined&&panels.includes(id)){panels=panels.filter(p=>p!==id);panels.splice(Math.max(0,Math.min(to,panels.length)),0,id);}
 return {[key]:panels,[active]:action==='close'?(layout[active]===id?panels[0]:layout[active]):id,[open]:panels.length>0&&(action==='toggle'&&layout[active]===id?!layout[open]:true)};
}
