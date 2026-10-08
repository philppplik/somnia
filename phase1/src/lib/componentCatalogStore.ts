import {getState,patchState,applyOperations} from '../store/appStore';
import * as cs from './componentSystem';
import {loadLibrary} from './componentActions';
import {builtinBlocks} from './builtinBlocks';
import {META_KEY,parseMeta,prune,parsePayload,type MetaMap} from './componentCatalog';
export function loadMeta():MetaMap{try{return prune(parseMeta(localStorage.getItem(META_KEY)),loadLibrary());}catch{return {};}}
export function saveMeta(m:MetaMap):void{localStorage.setItem(META_KEY,JSON.stringify(m));}
import type {EditorNode} from './editorPort';
import type {DropZone} from './layerDrop';
const ROOTS=new Set(['html','head']);
function locate(id:string):{node?:EditorNode;parent?:EditorNode}{let node:EditorNode|undefined,parent:EditorNode|undefined;const walk=(nodes:EditorNode[],p?:EditorNode)=>{for(const n of nodes){if(n.id===id){node=n;parent=p;}walk(n.children,n);}};walk(getState().nodes);return {node,parent};}
/** Where a component dropped on `targetId` at `zone` goes. Roots (html/head) refuse; body only accepts "inside". */
export function dropPlacement(targetId:string|null,zone:DropZone):{parentId:string;beforeId?:string}|null{if(!targetId)return null;const {node,parent}=locate(targetId);if(!node||ROOTS.has(node.tag))return null;if(zone==='inside'||node.tag==='body'||!parent)return {parentId:targetId};const i=parent.children.findIndex(c=>c.id===targetId);const before=zone==='before'?targetId:parent.children[i+1]?.id;return {parentId:parent.id,...(before?{beforeId:before}:{})};}
/** Insert from a canvas or Layers-tree drop. Marks are always written so Switch variant keeps working. Undo removes it in one step. */
export function insertFromDrop(raw:string,targetId:string|null,zone:DropZone='inside'):void{const p=parsePayload(raw);if(!p)throw new Error('This drag did not carry a component.');const place=dropPlacement(targetId,zone);if(!place)throw new Error('Drop the component onto a source container in the canvas.');const c=[...loadLibrary(),...builtinBlocks()].find(x=>x.id===p.componentId);const v=c?.variants.find(x=>x.id===p.variantId);if(!c||!v)throw new Error('That component no longer exists in the library.');const s=getState();const conflict=cs.idConflict(v.html,cs.idsIn(s.files[s.designFile]??''));if(conflict)throw new Error(conflict);applyOperations([{type:'insertHTML',file:s.designFile,parentId:place.parentId,...(place.beforeId?{beforeId:place.beforeId}:{}),html:'\n'+cs.markInstance(v.html,c.id,v.id)+'\n'}]);patchState({selectedElementId:place.parentId,notice:`Inserted ${c.name} (${v.name}) where you dropped it. Undo removes it.`});}
