import {getState,patchState,applyOperations} from '../store/appStore';
import * as cs from './componentSystem';
import {loadLibrary} from './componentActions';
import {META_KEY,parseMeta,prune,parsePayload,type MetaMap} from './componentCatalog';
export function loadMeta():MetaMap{try{return prune(parseMeta(localStorage.getItem(META_KEY)),loadLibrary());}catch{return {};}}
export function saveMeta(m:MetaMap):void{localStorage.setItem(META_KEY,JSON.stringify(m));}
/** Insert from a canvas drop. Container = the dropped-on source element; marks are always written so Switch variant keeps working. */
export function insertFromDrop(raw:string,targetId:string|null):void{const p=parsePayload(raw);if(!p)throw new Error('This drag did not carry a component.');if(!targetId)throw new Error('Drop the component onto a source container in the canvas.');const c=loadLibrary().find(x=>x.id===p.componentId);const v=c?.variants.find(x=>x.id===p.variantId);if(!c||!v)throw new Error('That component no longer exists in the library.');const s=getState();const conflict=cs.idConflict(v.html,cs.idsIn(s.files[s.designFile]??''));if(conflict)throw new Error(conflict);applyOperations([{type:'insertHTML',file:s.designFile,parentId:targetId,html:'\n'+cs.markInstance(v.html,c.id,v.id)+'\n'}]);patchState({selectedElementId:targetId,notice:`Inserted ${c.name} (${v.name}) where you dropped it. Undo removes it.`});}
