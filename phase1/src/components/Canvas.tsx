import type {CodeTheme} from '../lib/appearance';
import {lazy,Suspense} from 'react';
import {EmptyState} from './EmptyState';
import {FileTabs} from './FileTabs';
const SourceEditor=lazy(()=>import('./SourceEditor').then(m=>({default:m.SourceEditor})));
import {DesignCanvas} from './DesignCanvas';
import {useRef} from 'react';
import { useAppStore,patchState } from '../store/appStore';
const DEFAULT_RATIO=0.48,MIN_PX=240;
/** Draggable divider between code and design in split view. Arrow keys nudge, double click resets. */
function SplitDivider({box}:{box:React.RefObject<HTMLDivElement|null>}){
 const state=useAppStore();const horizontal=state.splitLayout==='horizontal';
 const clamp=(r:number)=>{const el=box.current;const size=el?(horizontal?el.clientHeight:el.clientWidth):1000;const lo=Math.min(0.5,MIN_PX/size);return Math.min(1-lo,Math.max(lo,r));};
 const move=(e:{clientX:number;clientY:number})=>{const el=box.current;if(!el)return;const r=el.getBoundingClientRect();let v=horizontal?(e.clientY-r.top)/r.height:(e.clientX-r.left)/r.width;if(state.splitSwap)v=1-v;patchState({splitRatio:clamp(v)});};
 return <div role="separator" tabIndex={0} aria-orientation={horizontal?'horizontal':'vertical'} aria-label="Resize code and design panes" aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(state.splitRatio*100)} className={`split-divider ${horizontal?'split-divider-h':'split-divider-v'}`}
  onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))move(e);}} onDoubleClick={()=>patchState({splitRatio:DEFAULT_RATIO})}
  onKeyDown={e=>{const step=e.shiftKey?0.1:0.02;const dir=horizontal?{ArrowUp:-1,ArrowDown:1}[e.key]:{ArrowLeft:-1,ArrowRight:1}[e.key];if(e.key==='Home'||e.key==='Enter'){e.preventDefault();patchState({splitRatio:DEFAULT_RATIO});return;}if(!dir)return;e.preventDefault();patchState({splitRatio:clamp(state.splitRatio+dir*step*(state.splitSwap?-1:1))});}}/>;
}
export function Canvas(){
 const box=useRef<HTMLDivElement>(null);
 const state=useAppStore();
 const code=<section className="code-pane" aria-label="Source editor" style={state.viewMode==='split'?{flex:`0 0 ${state.splitRatio*100}%`}:undefined}><FileTabs/><Suspense fallback={<div className="px-3 py-2 text-[10px] text-ink-3">Loading source editor...</div>}><SourceEditor source={state.files[state.activeFile]??''} file={state.activeFile} disabled={!state.coreConnected}/></Suspense></section>;
 if(!state.coreConnected)return <EmptyState/>;
 return <main className="center" aria-label="Editor workspace"><div ref={box} className={`workspace workspace-${state.viewMode}${state.viewMode==='split'?` split-${state.splitLayout}${state.splitSwap?' split-swap':''}`:''}`}>{state.viewMode!=='design'&&code}{state.viewMode==='split'&&<SplitDivider box={box}/>}{state.viewMode!=='code'&&<DesignCanvas/>}</div></main>;
}
