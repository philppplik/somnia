import {applyOperations,getState,patchState} from '../store/appStore';
import type {EditorNode} from './editorPort';
import * as cs from './componentSystem';
import {switchInstance,componentFields,captureOverrides,applyOverrides,writeOverrides,fieldKey,FIELD_ATTRS} from './componentProps';
import type {FieldKind} from './componentProps';
const KEY='somnia.components.v2',LEGACY='somnia.components.v1';
const uid=()=>crypto.randomUUID();
export function loadLibrary():cs.Component[]{try{const v2=localStorage.getItem(KEY);if(v2!==null)return cs.parseLibrary(v2);const migrated=cs.migrateLegacy(localStorage.getItem(LEGACY),uid);if(migrated.length)localStorage.setItem(KEY,JSON.stringify(migrated));return migrated;}catch{return [];}}
function store(next:cs.Component[]){localStorage.setItem(KEY,JSON.stringify(next));return next;}
export function mutate(fn:(list:cs.Component[])=>cs.Component[]){return store(fn(loadLibrary()));}
export const newId=uid;
export function findNode(id:string|null):EditorNode|undefined{if(!id)return undefined;let hit:EditorNode|undefined;const walk=(nodes:EditorNode[])=>{for(const n of nodes){if(n.id===id)hit=n;walk(n.children);}};walk(getState().nodes);return hit;}
/** Source of the selected element, as written in the file. */
export function selectedSource():string{const s=getState();const n=findNode(s.selectedElementId);const file=s.files[s.designFile];if(!n||file===undefined)throw new Error('Select an HTML source layer first.');return file.slice(n.from,n.to);}
/** The <body> node of the open document, the fallback insert target when nothing is selected. */
export function bodyNode():EditorNode|undefined{let hit:EditorNode|undefined;const walk=(nodes:EditorNode[])=>{for(const n of nodes){if(n.tag==='body'&&!hit)hit=n;walk(n.children);}};walk(getState().nodes);return hit;}
export function insertVariant(c:cs.Component,v:cs.Variant,mark:boolean){const s=getState();let parentId=s.selectedElementId,fallback=false;if(!parentId){parentId=bodyNode()?.id??null;fallback=true;}if(!parentId)throw new Error('Open an HTML file before inserting a component.');const conflict=cs.idConflict(v.html,cs.idsIn(s.files[s.designFile]??''));if(conflict)throw new Error(conflict);const html=mark?cs.markInstance(v.html,c.id,v.id):v.html;applyOperations([{type:'insertHTML',file:s.designFile,parentId,html:'\n'+html+'\n'}]);patchState({notice:fallback?`Inserted ${c.name} (${v.name}) at the end of body. Select a container first to target it.`:`Inserted ${c.name} (${v.name}). Source classes and styles are retained.`});}
/** Swap the selected element for another variant. One edit, so Undo restores the old block in one step. */
export function switchVariant(c:cs.Component,v:cs.Variant,mark:boolean){const s=getState();const n=findNode(s.selectedElementId);const file=s.files[s.designFile];if(!n||file===undefined)throw new Error('Select the block you want to switch.');
 const instance=cs.instanceOf(n.attrs);let html=v.html;
 if(instance?.componentId===c.id){const base=c.variants.find(x=>x.id===instance.variantId);if(!base)throw Error('The original variant no longer exists. Cannot safely carry instance edits to another variant.');html=switchInstance(file.slice(n.from,n.to),base.html,v.html);}
 const conflict=cs.idConflict(html,cs.idsOutside(file,n.from,n.to));if(conflict)throw new Error(conflict);
 html=mark?cs.markInstance(html,c.id,v.id):cs.stripMarks(html);
 // markInstance strips stale metadata by design; reattach the captured overrides after marking.
 if(mark&&instance?.componentId===c.id){const base=c.variants.find(x=>x.id===instance.variantId)!;html=writeOverrides(html,captureOverrides(file.slice(n.from,n.to),base.html));}
 applyOperations([{type:'replaceSource',file:s.designFile,text:cs.splice(file,n.from,n.to,html)}]);patchState({notice:`Switched to ${c.name} (${v.name}). Named field overrides are retained. Use Undo to go back.`});}

/** Bind a selected source element before saving it as a component/variant. */
export function exposeField(kind:FieldKind,name:string){
 if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,59}$/.test(name))throw Error('Use a field name starting with a letter (letters, numbers, hyphens or underscores only).');
 const s=getState(),n=findNode(s.selectedElementId);if(!n)throw Error('Select the element to expose.');
 // Validate the candidate before making any editor change.
 const original=selectedSource(),endOriginal=cs.openTagEnd(original,original.indexOf('<'));
 const tag=original.slice(0,endOriginal).replace(new RegExp(`\\s+${FIELD_ATTRS[kind]}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'gi'),'');
 const html=tag+original.slice(endOriginal),end=cs.openTagEnd(html,html.indexOf('<'));
 const cut=end-(/\/\s*>$/.test(html.slice(0,end))?2:1);
 const bound=html.slice(0,cut)+` ${FIELD_ATTRS[kind]}="${name}"`+html.slice(cut);
 componentFields(bound);
 applyOperations([{type:'replaceSource',file:s.designFile,text:cs.splice(s.files[s.designFile],n.from,n.to,bound)}]);
 patchState({notice:`Exposed ${kind} field "${name}". Save the containing block as a component or variant.`});
}
export function changeInstanceField(c:cs.Component,kind:FieldKind,name:string,value:string|null){
 const s=getState(),n=findNode(s.selectedElementId),file=s.files[s.designFile];if(!n||file===undefined)throw Error('Select the component instance again.');
 const inst=cs.instanceOf(n.attrs),base=c.variants.find(v=>v.id===inst?.variantId);if(inst?.componentId!==c.id||!base)throw Error('The selected instance has no matching library variant.');
 const current=file.slice(n.from,n.to),overrides=captureOverrides(current,base.html),key=fieldKey({kind,name});
 if(!componentFields(current).some(f=>fieldKey(f)===key))throw Error('This field is no longer present. Select the instance again.');
 let replacement=value;
 if(value===null){replacement=componentFields(base.html).find(f=>fieldKey(f)===key)?.value??null;if(replacement===null)throw Error('This field has no default in the current variant.');delete overrides[key];}else overrides[key]=value;
 if(replacement===null)throw Error('This field has no default.');
 const html=writeOverrides(applyOverrides(current,{[key]:replacement}),overrides);
 const conflict=cs.idConflict(html,cs.idsOutside(file,n.from,n.to));if(conflict)throw Error(conflict);
 applyOperations([{type:'replaceSource',file:s.designFile,text:cs.splice(file,n.from,n.to,html)}]);
 patchState({notice:value===null?'Field reset to this variant default.':'Instance field updated. Other instances are unchanged.'});
}
