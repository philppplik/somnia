import type {EditorNode} from '@somnia/editor-core';
/** Root-to-node path for the node with this id. Empty when the id is not in the tree. */
export function pathToId(nodes:EditorNode[],id:string|null):EditorNode[]{if(!id)return [];for(const n of nodes){if(n.id===id)return [n];const sub=pathToId(n.children,id);if(sub.length)return [n,...sub];}return [];}
/** Root-to-deepest path of the elements whose source range contains the offset. */
export function pathAtOffset(nodes:EditorNode[],offset:number):EditorNode[]{for(const n of nodes){if(offset>=n.from&&offset<=n.to)return [n,...pathAtOffset(n.children,offset)];}return [];}
export const offsetOf=(text:string,line:number,col:number)=>{let off=0;for(let i=1;i<line;i++){const nl=text.indexOf('\n',off);if(nl<0)return text.length;off=nl+1;}return Math.min(off+Math.max(0,col-1),text.length);};
export const crumbLabel=(n:EditorNode)=>n.tag+(n.attrs.id?`#${n.attrs.id}`:n.attrs.class?`.${n.attrs.class.trim().split(/\s+/)[0]}`:'');
