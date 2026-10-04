import type {EditorNode} from './editorPort';
export type DropZone='before'|'after'|'inside';
export type DropPlan={parentId:string;beforeId?:string};
type Lite={id:string;tag:string;children:Lite[]};
const PROTECTED=['html','head','body'];
function locate(nodes:Lite[],id:string,parent?:Lite):{node:Lite;parent?:Lite}|undefined{for(const n of nodes){if(n.id===id)return{node:n,parent};const r=locate(n.children,id,n);if(r)return r;}return undefined;}
const contains=(n:Lite,id:string):boolean=>n.id===id||n.children.some(c=>contains(c,id));
/** Turns a drop gesture into a move operation target, or an error message. Pure, so it is tested without a browser. */
export function planDrop(nodes:EditorNode[]|Lite[],dragId:string,targetId:string,zone:DropZone):DropPlan|{error:string}{
 const tree=nodes as Lite[];const drag=locate(tree,dragId);const target=locate(tree,targetId);
 if(!drag||!target)return{error:'That element no longer exists.'};
 if(PROTECTED.includes(drag.node.tag))return{error:'The document root, head and body cannot be moved.'};
 if(contains(drag.node,targetId))return{error:'An element cannot be moved into itself or its descendants.'};
 if(zone==='inside')return{parentId:target.node.id};
 if(!target.parent)return{error:'Drop inside the document root instead.'};
 const sibs=target.parent.children.filter(c=>c.id!==dragId);const i=sibs.findIndex(c=>c.id===targetId);
 return{parentId:target.parent.id,beforeId:zone==='before'?targetId:sibs[i+1]?.id};
}
/** Keyboard alternative: move into the previous sibling (indent). */
export function planIndent(nodes:EditorNode[]|Lite[],id:string):DropPlan|{error:string}{const r=locate(nodes as Lite[],id);if(!r?.parent)return{error:'Document roots cannot be moved.'};const i=r.parent.children.findIndex(c=>c.id===id);const prev=r.parent.children[i-1];if(!prev)return{error:'There is no previous sibling to move into.'};return{parentId:prev.id};}
/** Keyboard alternative: move out of the parent, right after it (outdent). */
export function planOutdent(nodes:EditorNode[]|Lite[],id:string):DropPlan|{error:string}{const r=locate(nodes as Lite[],id);if(!r?.parent)return{error:'Document roots cannot be moved.'};const g=locate(nodes as Lite[],r.parent.id);if(!g?.parent||PROTECTED.includes(r.parent.tag))return{error:'This element is already at the top level of the body.'};const sibs=g.parent.children;const i=sibs.findIndex(c=>c.id===r.parent!.id);return{parentId:g.parent.id,beforeId:sibs[i+1]?.id};}
export const isError=(p:DropPlan|{error:string}):p is {error:string}=>'error' in p;
