import {useSyncExternalStore} from 'react';
import {getState,subscribe} from '../store/appStore';
import {getMedia,subscribeMedia} from './media';
import {deriveContext,type ToolStates} from './uiContext';
import type {EditorNode} from './editorPort';
import {lockedIds} from './alignApply';
let tree:EditorNode[]|null=null,index=new Map<string,EditorNode>(),locks=new Set<string>(),flat:EditorNode[]=[];
let tools:ToolStates={};
function derive(){const s=getState();if(tree!==s.nodes){tree=s.nodes;index=new Map();flat=[];const walk=(nodes:EditorNode[])=>nodes.forEach(n=>{index.set(n.id,n);flat.push(n);walk(n.children);});walk(s.nodes);locks=lockedIds(s.nodes);}
 const media=getMedia(),source=s.files[s.activeFile]??'';let cursorNode:EditorNode|undefined;
 if(s.viewMode==='code'&&s.activeFile===s.designFile){let offset=0;for(let line=1;line<s.cursorLine;line++){const end=source.indexOf('\n',offset);if(end<0)break;offset=end+1;}offset+=s.cursorCol-1;cursorNode=flat.filter(n=>n.from<=offset&&n.to>=offset).sort((a,b)=>(a.to-a.from)-(b.to-b.from))[0];}
 return deriveContext(s,{...tools,nodes:index,lockedIds:locks,cursorNode,media:media.items.find(i=>i.name===media.active)??null});}
let snapshot=derive(),key=JSON.stringify(snapshot),timer:ReturnType<typeof setTimeout>|undefined;
const listeners=new Set<()=>void>();
function publish(){const next=derive(),nextKey=JSON.stringify(next);if(nextKey!==key){snapshot=next;key=nextKey;listeners.forEach(fn=>fn());}}
let selectionKey='';
subscribe(()=>{const s=getState(),next=[s.selectedElementId,...s.selectedElementIds].join('|');if(next!==selectionKey){selectionKey=next;clearTimeout(timer);timer=setTimeout(publish,120);}else{clearTimeout(timer);publish();}});
subscribeMedia(publish);
export function setUiToolState(next:ToolStates){tools=next;publish();}
export const getUiContext=()=>snapshot;
export const subscribeUiContext=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const useUiContext=()=>useSyncExternalStore(subscribeUiContext,getUiContext,getUiContext);
export const getContextNode=(id:string|null)=>id?index.get(id):undefined;
