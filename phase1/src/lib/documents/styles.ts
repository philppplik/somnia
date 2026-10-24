import {useSyncExternalStore} from 'react';
import type {StyleItem} from './protocol';
/** The paragraph and character styles the open document offers (custom ones first). Session-only; refreshed by the session. */
let items:readonly StyleItem[]=[];const listeners=new Set<()=>void>();
export const styleList=()=>items;
export function setStyleList(next:readonly StyleItem[]){items=next;listeners.forEach(fn=>fn());}
export const useStyleList=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},styleList,styleList);
/** Custom (not built-in) paragraph styles: the ones the format bar adds below the fixed list. */
export const customParagraphStyles=(list:readonly StyleItem[])=>list.filter(s=>s.kind==='paragraph'&&!s.builtin);
