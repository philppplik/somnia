import {applyOperations,getState,patchState} from '../store/appStore';
import type {EditorNode} from './editorPort';
import * as cs from './componentSystem';
const KEY='somnia.components.v2',LEGACY='somnia.components.v1';
const uid=()=>crypto.randomUUID();
export function loadLibrary():cs.Component[]{try{const v2=localStorage.getItem(KEY);if(v2!==null)return cs.parseLibrary(v2);const migrated=cs.migrateLegacy(localStorage.getItem(LEGACY),uid);if(migrated.length)localStorage.setItem(KEY,JSON.stringify(migrated));return migrated;}catch{return [];}}
function store(next:cs.Component[]){localStorage.setItem(KEY,JSON.stringify(next));return next;}
export function mutate(fn:(list:cs.Component[])=>cs.Component[]){return store(fn(loadLibrary()));}
export const newId=uid;
export function findNode(id:string|null):EditorNode|undefined{if(!id)return undefined;let hit:EditorNode|undefined;const walk=(nodes:EditorNode[])=>{for(const n of nodes){if(n.id===id)hit=n;walk(n.children);}};walk(getState().nodes);return hit;}
/** Source of the selected element, as written in the file. */
export function selectedSource():string{const s=getState();const n=findNode(s.selectedElementId);const file=s.files[s.designFile];if(!n||file===undefined)throw new Error('Select an HTML source layer first.');return file.slice(n.from,n.to);}
export function insertVariant(c:cs.Component,v:cs.Variant,mark:boolean){const s=getState();if(!s.selectedElementId)throw new Error('Select a source container before inserting a component.');const conflict=cs.idConflict(v.html,cs.idsIn(s.files[s.designFile]??''));if(conflict)throw new Error(conflict);const html=mark?cs.markInstance(v.html,c.id,v.id):v.html;applyOperations([{type:'insertHTML',file:s.designFile,parentId:s.selectedElementId,html:'\n'+html+'\n'}]);patchState({notice:`Inserted ${c.name} (${v.name}). Source classes and styles are retained.`});}
/** Swap the selected element for another variant. One edit, so Undo restores the old block in one step. */
export function switchVariant(c:cs.Component,v:cs.Variant,mark:boolean){const s=getState();const n=findNode(s.selectedElementId);const file=s.files[s.designFile];if(!n||file===undefined)throw new Error('Select the block you want to switch.');const conflict=cs.idConflict(v.html,cs.idsOutside(file,n.from,n.to));if(conflict)throw new Error(conflict);const html=mark?cs.markInstance(v.html,c.id,v.id):v.html;applyOperations([{type:'replaceSource',file:s.designFile,text:cs.splice(file,n.from,n.to,html)}]);patchState({notice:`Switched to ${c.name} (${v.name}). Use Undo to go back.`});}
