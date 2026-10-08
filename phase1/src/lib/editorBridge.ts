/** Lets global commands act on the code editor that is currently mounted. */
import {getState} from '../store/appStore';
import type {EditorView} from '@codemirror/view';
let active:EditorView|null=null;
export const setActiveEditor=(v:EditorView|null)=>{active=v;};
export const getActiveEditor=()=>active;
export const transformSelection=(view:EditorView,fn:(t:string)=>string)=>{const r=view.state.selection.main;if(r.empty)return false;const next=fn(view.state.sliceDoc(r.from,r.to));view.dispatch({changes:{from:r.from,to:r.to,insert:next},selection:{anchor:r.from,head:r.from+next.length}});return true;};

/** Live CodeMirror selection; source must match the canonical active buffer. */
export function readActiveSelection(){if(!active)return null;const st=getState();if(active.state.doc.toString()!==st.files[st.activeFile])return null;const r=active.state.selection.main;return {path:st.activeFile,from:r.from,to:r.to,text:active.state.sliceDoc(r.from,r.to)};}
