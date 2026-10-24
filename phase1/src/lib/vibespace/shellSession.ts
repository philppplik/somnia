import type {VibeViewState} from './state';
import {initialVibeState} from './state';
/** Read-only shell projection. The canvas remains the sole transport/controller owner. */
export interface VibeShellState {view:VibeViewState;spaceId:string|null;runId:string|null;native:boolean;canCreateSpace:boolean;canCreateStudio:boolean}
const empty:VibeShellState={view:initialVibeState,spaceId:null,runId:null,native:false,canCreateSpace:false,canCreateStudio:false};
let state=empty,owner:symbol|null=null;
const listeners=new Set<()=>void>();
export const getVibeShellState=()=>state;
export const subscribeVibeShell=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
const emit=()=>listeners.forEach(fn=>fn());
export function claimVibeShell(){const token=Symbol('vibespace');owner=token;state=empty;emit();return {
 report(next:VibeShellState){if(owner!==token)return;state=next;emit();},
 release(){if(owner!==token)return;owner=null;state=empty;emit();},
};}
export const vibeShellReady=()=>!!state.view.snapshot&&!state.view.loading&&!state.view.pending&&!state.view.error;
