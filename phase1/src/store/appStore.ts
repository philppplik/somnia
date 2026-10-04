import {readLook,rememberLook,applyLook,type Look} from '../lib/look';
import {readAppearance,rememberAppearance,type Contrast,type CodeTheme} from '../lib/appearance';
import {readEditorPrefs,rememberEditorPrefs,type EditorPrefs} from '../lib/editorPrefs';
import {readTheme,rememberTheme,readThemeChoice,rememberThemeChoice,type ThemeChoice} from '../lib/theme';
import { useSyncExternalStore } from 'react';
import type { EditorNode,EditorProjectPort,Operation,Origin } from '../lib/editorPort';
export type LeftTab='layers'|'files'|'search'|'assets'|'components';
export type RightTab='design'|'prototype'|'code';
export type ViewMode='design'|'code'|'split';
export interface DiskComparison {path:string;disk:string;editor:string;apply:(content:string)=>Promise<void>}
export interface AppState {exportDialog:boolean;closeProjectPrompt:boolean;saveDialog:null|{error:string|null;busy:boolean};jumpTo:null|{file:string;line:number;col:number;nonce:number};settingsSection:string;look:Look;closePrompt:null|'disk'|'memory';settingsOpen:boolean;contrast:Contrast;codeTheme:CodeTheme;wrapLines:boolean;extensionThemes:{id:string;label:string}[];extensionPanels:{id:string;extId:string;title:string;side:'left'|'right';html:string}[];activePanel:{left:string|null;right:string|null};storage:'memory'|'disk'|'tab';diskComparison:DiskComparison|null;nativeConnected:boolean;
 sidebarWidth:number;inspectorWidth:number;sidebarOpen:boolean;inspectorOpen:boolean;problemsOpen:boolean;
 leftTab:LeftTab;rightTab:RightTab;zoom:number;viewport:number;viewportHeight:number;viewMode:ViewMode;
 paletteOpen:boolean;recentCommands:string[];selectedElementId:string|null;selectedElementIds:string[];computedStyle:Record<string,string>;activeFile:string;openFiles:string[];designFile:string;cursorLine:number;cursorCol:number;
 projectName:string;coreConnected:boolean;revision:number;files:Readonly<Record<string,string>>;nodes:EditorNode[];
 isDirty:boolean;lastSavedAt:string|null;notice:string;theme:'dark'|'light';themeChoice:ThemeChoice;editorPrefs:EditorPrefs;splitLayout:'vertical'|'horizontal';splitSwap:boolean;splitRatio:number;
}
const demo=(id:string,tag:string,children:EditorNode[]=[]):EditorNode=>({id,tag,attrs:{},children,from:0,to:0,contentFrom:0,contentTo:0,locked:false,hidden:false});
const SPLIT_KEY='somnia.split.v1';
let state:AppState={exportDialog:false,closeProjectPrompt:false,saveDialog:null,jumpTo:null,settingsSection:'Appearance',look:readLook(),closePrompt:null,viewportHeight:900,...readSplit(),editorPrefs:readEditorPrefs(),themeChoice:readThemeChoice(),settingsOpen:false,extensionThemes:[],extensionPanels:[],activePanel:{left:null,right:null},storage:'memory',...readAppearance(),diskComparison:null,nativeConnected:false,sidebarWidth:260,inspectorWidth:320,sidebarOpen:true,inspectorOpen:true,problemsOpen:false,leftTab:'layers',rightTab:'design',zoom:75,viewport:1280,viewMode:'design',paletteOpen:false,recentCommands:[],selectedElementId:null,selectedElementIds:[],computedStyle:{},activeFile:'index.html',openFiles:['index.html'],designFile:'index.html',cursorLine:1,cursorCol:1,projectName:'Untitled project',coreConnected:false,revision:0,files:{},nodes:[demo('header','header',[demo('nav','nav')]),demo('main','main',[demo('section','section',[demo('heading','h1'),demo('button','button')])]),demo('footer','footer')],isDirty:false,lastSavedAt:null,notice:'Shell preview. No folder connected.',theme:readTheme()};
const listeners=new Set<()=>void>();
export const getState=()=>state;
function readSplit():{splitLayout:'vertical'|'horizontal';splitSwap:boolean;splitRatio:number}{try{const x=JSON.parse(localStorage.getItem(SPLIT_KEY)||'{}');return{splitLayout:x.splitLayout==='horizontal'?'horizontal':'vertical',splitSwap:x.splitSwap===true,splitRatio:typeof x.splitRatio==='number'&&x.splitRatio>=0.15&&x.splitRatio<=0.85?x.splitRatio:0.48};}catch{return{splitLayout:'vertical',splitSwap:false,splitRatio:0.48};}}
export function patchState(patch:Partial<AppState>){if('splitLayout' in patch||'splitSwap' in patch||'splitRatio' in patch){const n={splitLayout:patch.splitLayout??state.splitLayout,splitSwap:patch.splitSwap??state.splitSwap,splitRatio:patch.splitRatio??state.splitRatio};try{localStorage.setItem(SPLIT_KEY,JSON.stringify(n));}catch{/* storage unavailable */}}if(patch.theme)rememberTheme(patch.theme);if(patch.editorPrefs)rememberEditorPrefs(patch.editorPrefs);if(patch.themeChoice)rememberThemeChoice(patch.themeChoice);if(patch.look){rememberLook(patch.look);applyLook(patch.look);}if('selectedElementId' in patch&&!('selectedElementIds' in patch))patch.selectedElementIds=patch.selectedElementId?[patch.selectedElementId]:[];state={...state,...patch};if(patch.contrast||patch.codeTheme||'wrapLines' in patch){if(!rememberAppearance(state.contrast,state.codeTheme,state.wrapLines))state.notice='Appearance changed for this session. Storage unavailable; settings will not survive restart.';}listeners.forEach(fn=>fn());}
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
 const isHtml=(f:string)=>/\.html?$/i.test(f);const designFile=isHtml(activeFile)?activeFile:(isHtml(state.designFile)&&state.designFile in files?state.designFile:(Object.keys(files).find(isHtml)??''));
 try{if(designFile)nodes=core.tree(designFile);}catch(error){patchState({notice:error instanceof Error?error.message:'Document structure unavailable.'});}
 const ids=new Set<string>();const collect=(list:EditorNode[])=>list.forEach(n=>{ids.add(n.id);collect(n.children);});collect(nodes);
 const openFiles=[...state.openFiles.filter(f=>f in files)];if(activeFile&&!openFiles.includes(activeFile))openFiles.push(activeFile);
 patchState({files,nodes,activeFile,openFiles,designFile,revision:core.revision,isDirty:isDirty(),selectedElementIds:state.selectedElementIds.filter(id=>ids.has(id)),selectedElementId:state.selectedElementId&&ids.has(state.selectedElementId)?state.selectedElementId:null});
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

/** Open a project file in a tab and make it the active source file. */
export function openFileTab(path:string){if(!(path in state.files))return;patchState({openFiles:state.openFiles.includes(path)?state.openFiles:[...state.openFiles,path],activeFile:path,selectedElementId:null});refreshProject();}
/** Close a tab; the neighbouring tab becomes active. The last tab stays open. */
export function closeFileTab(path:string){if(state.openFiles.length<=1)return;const i=state.openFiles.indexOf(path);const next=state.openFiles.filter(f=>f!==path);patchState({openFiles:next,...(state.activeFile===path?{activeFile:next[Math.max(0,i-1)],selectedElementId:null}:{})});refreshProject();}

/** Breakpoint used to scope edits for a viewport width: base styles at desktop widths, 900px and 600px rules below. */
export const breakpointFor=(width:number):number|undefined=>width>=1100?undefined:width>=700?900:600;
export const clampViewport=(n:number,max=3840)=>Math.min(max,Math.max(200,Math.round(Number.isFinite(n)?n:1280)));

/** Opens a file tab and asks its editor to place the cursor on a line (Problems panel, search results). */
export function jumpToLine(file:string,line:number,col=1){openFileTab(file);const st=getState();patchState({jumpTo:{file,line,col,nonce:Date.now()+Math.random()},...(st.viewMode==='design'?{viewMode:'split' as const}:{})});}

/** Leaves the project without opening another one: the app returns to its empty state. */
export function closeCore(){unsubscribeCore?.();unsubscribeCore=null;core=null;savedFiles={};patchState({coreConnected:false,files:{},nodes:[],openFiles:[],activeFile:'',designFile:'',selectedElementId:null,selectedElementIds:[],isDirty:false,lastSavedAt:null,storage:'memory',nativeConnected:false,projectName:'',notice:'Project closed.'});}
