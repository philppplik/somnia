import {useSyncExternalStore} from 'react';
import {cleanDock,type DockLayout} from '../lib/workspace/docking';
import type {PanelDef} from '../lib/shell/types';
const KEY='somnia.dockLayout.v1';const listeners=new Set<()=>void>();let saved:Record<string,unknown>={};
try{saved=JSON.parse(localStorage.getItem(KEY)??'{}');if(!saved||Array.isArray(saved)||typeof saved!=='object')saved={};}catch{/* session only */}
const state=new Map<string,DockLayout>();
export function dockLayout(id:string,panels:readonly PanelDef[],defaults:{left:string[];right:string[]}){if(!state.has(id))state.set(id,cleanDock(saved[id],panels,defaults));return state.get(id)!;}
export function updateDock(id:string,layout:DockLayout){state.set(id,layout);saved={...saved,[id]:layout};try{localStorage.setItem(KEY,JSON.stringify(saved));}catch{/* session only */}listeners.forEach(f=>f());}
export function useDock(id:string,panels:readonly PanelDef[],defaults:{left:string[];right:string[]}){return useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},()=>dockLayout(id,panels,defaults));}
