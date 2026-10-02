import { useSyncExternalStore } from 'react';
import type { EditorNode,EditorProjectPort,Operation,Origin } from '../lib/editorPort';
export type LeftTab='layers'|'assets'|'components';
export type RightTab='design'|'prototype'|'code';
export type ViewMode='design'|'code'|'split';
export interface AppState {
 sidebarWidth:number;inspectorWidth:number;sidebarOpen:boolean;inspectorOpen:boolean;problemsOpen:boolean;
 leftTab:LeftTab;rightTab:RightTab;zoom:number;viewport:1280|820|390;viewMode:ViewMode;
 paletteOpen:boolean;recentCommands:string[];selectedElementId:string|null;selectedElementIds:string[];computedStyle:Record<string,string>;activeFile:string;
 projectName:string;coreConnected:boolean;revision:number;files:Readonly<Record<string,string>>;nodes:EditorNode[];
 isDirty:boolean;lastSavedAt:string|null;notice:string;theme:'dark'|'light';
}
const demo=(id:string,tag:string,children:EditorNode[]=[]):EditorNode=>({id,tag,attrs:{},children,from:0,to:0,contentFrom:0,contentTo:0,locked:false,hidden:false});
let state:AppState={sidebarWidth:260,inspectorWidth:320,sidebarOpen:true,inspectorOpen:true,problemsOpen:false,leftTab:'layers',rightTab:'design',zoom:75,viewport:1280,viewMode:'design',paletteOpen:false,recentCommands:[],selectedElementId:null,selectedElementIds:[],computedStyle:{},activeFile:'index.html',projectName:'Untitled project',coreConnected:false,revision:0,files:{},nodes:[demo('header','header',[demo('nav','nav')]),demo('main','main',[demo('section','section',[demo('heading','h1'),demo('button','button')])]),demo('footer','footer')],isDirty:false,lastSavedAt:null,notice:'Shell preview. No folder connected.',theme:'dark'};
const listeners=new Set<()=>void>();
export const getState=()=>state;
export function patchState(patch:Partial<AppState>){if('selectedElementId' in patch&&!('selectedElementIds' in patch))patch.selectedElementIds=patch.selectedElementId?[patch.selectedElementId]:[];state={...state,...patch};listeners.forEach(fn=>fn());}
export const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const useAppStore=()=>useSyncExternalStore(subscribe,getState,getState);
let core:EditorProjectPort|null=null;
let unsubscribeCore:(()=>void)|null=null;
let savedFiles:Record<string,string>={};
function isDirty(){const files=core?.files??{};return Object.keys(files).length!==Object.keys(savedFiles).length||Object.entries(files).some(([file,text])=>savedFiles[file]!==text);}
export function refreshProject(){
 if(!core)return;
 const files={...core.files};const activeFile=state.activeFile in files?state.activeFile:(Object.keys(files).find(f=>f.endsWith('.html'))??Object.keys(files)[0]??'');
 let nodes:EditorNode[]=[];
 try{if(activeFile.endsWith('.html'))nodes=core.tree(activeFile);}catch(error){patchState({notice:error instanceof Error?error.message:'Document structure unavailable.'});}
 const ids=new Set<string>();const collect=(list:EditorNode[])=>list.forEach(n=>{ids.add(n.id);collect(n.children);});collect(nodes);
 patchState({files,nodes,activeFile,revision:core.revision,isDirty:isDirty(),selectedElementIds:state.selectedElementIds.filter(id=>ids.has(id)),selectedElementId:state.selectedElementId&&ids.has(state.selectedElementId)?state.selectedElementId:null});
}
/** Call after initial folder read. Cleanup on close/unmount. Core is the only document/history owner. */
export function connectEditorProject(project:EditorProjectPort,options:{name?:string;alreadySaved?:boolean}={}){
 unsubscribeCore?.();core=project;savedFiles=options.alreadySaved?{...project.files}:{};
 patchState({coreConnected:true,projectName:options.name??'Untitled project',selectedElementId:null,notice:'In-memory project. Native filesystem service is not connected.'});
 unsubscribeCore=project.subscribe('internal',()=>refreshProject());refreshProject();
 return()=>{if(core!==project)return;unsubscribeCore?.();unsubscribeCore=null;core=null;patchState({coreConnected:false,files:{},nodes:[],selectedElementId:null,isDirty:false,lastSavedAt:null,notice:'Project closed.'});};
}
export function applyOperations(operations:Operation[],origin:Origin='canvas',group?:string){
 if(!core)throw new Error('Editor core is not connected.');
 const result=core.transact({origin,operations,expectedRevision:core.revision,group});refreshProject();return result;
}
export function applyHistory(direction:'undo'|'redo'){
 if(!core)throw new Error('Editor core is not connected.');
 const result=core[direction]();refreshProject();patchState({notice:result?`${direction==='undo'?'Undid':'Redid'} document change.`:`Nothing to ${direction}.`});
}
/** Save integration must pass the exact snapshot it actually wrote; edits during save remain dirty. */
export function markSaved(snapshot:Readonly<Record<string,string>>,at=new Date().toISOString()){
 savedFiles={...snapshot};patchState({isDirty:isDirty(),lastSavedAt:at,notice:'Saved to disk.'});
}
export function markFileSaved(file:string,content:string){savedFiles[file]=content;patchState({isDirty:isDirty(),lastSavedAt:new Date().toISOString(),notice:'Saved to disk.'});}
