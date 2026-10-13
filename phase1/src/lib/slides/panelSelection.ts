import {useSyncExternalStore} from 'react';
import type {TextSelection} from './panelModel';
/** Ephemeral, source-bound selection. Never persists expired blob URLs across reloads. */
let selection:TextSelection|null=null;const listeners=new Set<()=>void>();
export const getSlideTextSelection=()=>selection;
export function selectSlideText(value:TextSelection|null){selection=value;listeners.forEach(f=>f());}
export const subscribeSlideTextSelection=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
export function useSlideTextSelection(){return useSyncExternalStore(subscribeSlideTextSelection,getSlideTextSelection,getSlideTextSelection);}
