import {useSyncExternalStore} from 'react';
import {getActiveEditor} from './editorBridge';
import {getState,getProjectGeneration} from '../store/appStore';
import {EditorView} from '@codemirror/view';
export interface CodeSnippet {id:string;name:string;body:string}
export const SNIPPET_KEY='somnia.codeSnippets.v1';
export function validateSnippets(value:unknown):CodeSnippet[]{
 if(!Array.isArray(value)||value.length>64)throw Error('invalid-snippets');
 const ids=new Set<string>();const result=value.map(x=>{if(!x||typeof x.id!=='string'||!x.id||x.id.length>100||ids.has(x.id)||typeof x.name!=='string'||!x.name.trim()||x.name.length>80||typeof x.body!=='string'||!x.body||x.body.length>32768)throw Error('invalid-snippet');ids.add(x.id);return {id:x.id,name:x.name.trim(),body:x.body};});
 if(new TextEncoder().encode(JSON.stringify(result)).length>256*1024)throw Error('snippet-limit');return result;
}
export function loadSnippets(storage:Pick<Storage,'getItem'>):CodeSnippet[]{const raw=storage.getItem(SNIPPET_KEY);return raw?validateSnippets(JSON.parse(raw)):[];}
export function persistSnippets(storage:Pick<Storage,'setItem'>,value:unknown):CodeSnippet[]{const next=validateSnippets(value);storage.setItem(SNIPPET_KEY,JSON.stringify(next));return next;}
export function captureSnippetTarget(){const view=getActiveEditor(),st=getState();if(!view||!view.dom.isConnected||st.activeStudio!=='code'||view.state.doc.toString()!==st.files[st.activeFile]||view.state.readOnly||!view.state.facet(EditorView.editable))return null;return {view,file:st.activeFile,raw:view.state.doc.toString(),selection:view.state.selection,generation:getProjectGeneration()};}
export function insertCodeSnippet(target:ReturnType<typeof captureSnippetTarget>,body:string){
 if(!target)throw Error('no-target');const st=getState(),view=getActiveEditor();
 if(!view||!view.dom.isConnected||view!==target.view||st.activeStudio!=='code'||st.activeFile!==target.file||getProjectGeneration()!==target.generation||st.files[target.file]!==target.raw||view.state.doc.toString()!==target.raw||!view.state.selection.eq(target.selection)||view.state.readOnly||!view.state.facet(EditorView.editable))throw Error('stale-target');
 validateSnippets([{id:'insert',name:'Insert',body}]);const expected=view.state.update(view.state.replaceSelection(body)).state.doc.toString();view.dispatch({...view.state.replaceSelection(body),userEvent:'input.snippet'});if(getState().files[target.file]!==expected)throw Error('insert-unverified');view.focus();
}
let snapshot:{open:boolean;target:ReturnType<typeof captureSnippetTarget>}={open:false,target:null};const listeners=new Set<()=>void>();
export const openCodeSnippets=()=>{snapshot={open:true,target:captureSnippetTarget()};listeners.forEach(fn=>fn());};
export const closeCodeSnippets=()=>{snapshot={open:false,target:null};listeners.forEach(fn=>fn());};
export const useCodeSnippetDialog=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>snapshot);
