/** Shared state between the Markdown source editor, its toolbar and the preview: the mounted editor view, the scroll sync preference and "reveal in source". */
import {useSyncExternalStore} from 'react';
import {EditorSelection} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {getState,patchState} from '../store/appStore';
let source:EditorView|null=null;const subs=new Set<()=>void>();
const emit=()=>subs.forEach(f=>f());
export const setMdSource=(v:EditorView|null)=>{if(source===v)return;source=v;emit();};
export const getMdSource=()=>source;
const subscribe=(f:()=>void)=>{subs.add(f);return()=>{subs.delete(f);};};
/** The mounted Markdown source editor view, or null when the active file is not Markdown. */
export const useMdSource=()=>useSyncExternalStore(subscribe,()=>source);
const KEY='somnia.markdown.syncScroll';
let sync=true;try{sync=localStorage.getItem(KEY)!=='0';}catch{/* default on */}
export const getSyncScroll=()=>sync;
export const setSyncScroll=(on:boolean)=>{sync=on;try{localStorage.setItem(KEY,on?'1':'0');}catch{/* not persisted */}emit();};
export const useSyncScroll=()=>useSyncExternalStore(subscribe,()=>sync);
/** Selects the source lines [start,end) (zero-based, half-open), scrolls them into view and focuses the editor. Opens Split first when the source is hidden. */
export function revealInSource(start:number,end:number){
 const go=(tries:number)=>{const v=source;if(!v){if(tries>0)requestAnimationFrame(()=>go(tries-1));return;}
  const doc=v.state.doc;const a=doc.line(Math.min(doc.lines,Math.max(1,start+1))),b=doc.line(Math.min(doc.lines,Math.max(1,end)));
  v.dispatch({selection:EditorSelection.range(a.from,Math.max(a.from,b.to)),effects:EditorView.scrollIntoView(a.from,{y:'start',yMargin:24})});v.focus();};
 if(getState().viewMode==='design')patchState({viewMode:'split'});
 go(30);}
