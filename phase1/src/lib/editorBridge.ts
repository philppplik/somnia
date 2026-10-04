/** Lets global commands act on the code editor that is currently mounted. */
import type {EditorView} from '@codemirror/view';
let active:EditorView|null=null;
export const setActiveEditor=(v:EditorView|null)=>{active=v;};
export const getActiveEditor=()=>active;
export const transformSelection=(view:EditorView,fn:(t:string)=>string)=>{const r=view.state.selection.main;if(r.empty)return false;const next=fn(view.state.sliceDoc(r.from,r.to));view.dispatch({changes:{from:r.from,to:r.to,insert:next},selection:{anchor:r.from,head:r.from+next.length}});return true;};
