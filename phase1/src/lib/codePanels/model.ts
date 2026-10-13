import type {EditorNode} from '../editorPort';
export interface OutlineEntry {id:string;tag:string;label:string;depth:number;line:number;col:number;locked:boolean}
/** Engine IDs, never generated IDs: revealing an entry can safely select the canvas node. */
export function codeOutline(nodes:readonly EditorNode[],source:string):OutlineEntry[]{
 const rows:OutlineEntry[]=[];
 const walk=(list:readonly EditorNode[],depth:number,inherited=false)=>list.forEach(n=>{
  const before=source.slice(0,n.from),line=before.split('\n').length,col=before.length-before.lastIndexOf('\n');
  rows.push({id:n.id,tag:n.tag,label:`<${n.tag}${n.attrs.id?' #'+n.attrs.id:''}${n.attrs.class?' .'+n.attrs.class.trim().split(/\s+/).join('.'):''}>`,depth,line,col,locked:inherited||n.locked});
  walk(n.children,depth+1,inherited||n.locked);
 });walk(nodes,0);return rows;
}
export function filterOutline(rows:readonly OutlineEntry[],query:string){const q=query.trim().toLowerCase();return rows.filter(r=>!q||r.label.toLowerCase().includes(q));}
export function interactionAttributes(node:EditorNode){return Object.entries(node.attrs).filter(([k])=>/^(href|target|rel|src|poster|controls|autoplay|loop|muted|download|action|method|tabindex|role|aria-.+|on[a-z]+)$/i.test(k));}
export function fileFacts(source:string){return {lines:source.split('\n').length,characters:source.length,bytes:new TextEncoder().encode(source).length};}
export function safeAttribute(name:string,value:string){
 if(!/^[a-zA-Z_:][a-zA-Z0-9_.:-]*$/.test(name)||/^on/i.test(name)||name.toLowerCase()==='style'||/^data-editor-/i.test(name))return false;
 if(/^(href|src|action|poster)$/i.test(name)&&/^\s*(javascript|vbscript):/i.test(value))return false;
 return true;
}
