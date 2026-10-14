import type {InterfaceLayout,InterfaceSizing,InterfaceConstraints,InterfaceInstance,InterfaceComponent,InterfaceVariable,InterfaceTextStyle} from './schema';
import {validateInterfaceFeatures} from './validation';
/** Somnia-owned P0 scene. No external engine, file association or SDK surface. */
export type {NodeKind,InterfaceNode,InterfacePage,InterfaceDocument} from './schema';
import type {NodeKind,InterfaceNode,InterfacePage,InterfaceDocument} from './schema';
export const MAX_NODES=2000,MAX_DEPTH=64,MAX_BYTES=5_000_000;
export const uid=()=>globalThis.crypto.randomUUID();
export function createInterfaceDocument():InterfaceDocument{return {kind:'somnia-interface',version:1,id:uid(),name:'Untitled interface',revision:0,pages:[{id:uid(),name:'Page 1',children:[]}],nodes:[]};}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const label=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=256;
function refs(v:unknown):v is string[]{return Array.isArray(v)&&v.length<=MAX_NODES&&v.every(validId)&&new Set(v).size===v.length;}
/** Validates all links before replacing a working document. Optional JSON fields survive reopen. */
export function parseInterfaceDocument(text:string):InterfaceDocument{
 if(text.length>MAX_BYTES||new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Interface snapshot exceeds 5 MB.');
 const d:unknown=JSON.parse(text);
 if(!object(d)||d.kind!=='somnia-interface'||d.version!==1||!validId(d.id)||!label(d.name)||!Number.isSafeInteger(d.revision)||Number(d.revision)<0||!Array.isArray(d.pages)||!d.pages.length||d.pages.length>100||!Array.isArray(d.nodes)||d.nodes.length>MAX_NODES)throw Error('Invalid or unsupported Interface snapshot.');
 const ids=new Set<string>([d.id]);const pages=new Map<string,InterfacePage>();const nodes=new Map<string,InterfaceNode>();
 for(const p of d.pages){if(!object(p)||!validId(p.id)||ids.has(p.id)||!label(p.name)||!refs(p.children))throw Error('Invalid page.');ids.add(p.id);pages.set(p.id,p as unknown as InterfacePage);}
 for(const n of d.nodes){
  if(!object(n)||!validId(n.id)||ids.has(n.id)||!pages.has(String(n.pageId))||!(n.parentId===null||validId(n.parentId))||!refs(n.children)||!['frame','group','rectangle','text'].includes(String(n.kind))||!label(n.name)||typeof n.hidden!=='boolean'||typeof n.locked!=='boolean'||typeof n.fill!=='string'||!/^#[0-9a-fA-F]{6}$/.test(n.fill))throw Error('Invalid layer.');
  for(const key of ['x','y','width','height'])if(typeof n[key]!=='number'||!Number.isFinite(n[key])||Math.abs(Number(n[key]))>32768||(['width','height'].includes(key)&&Number(n[key])<1))throw Error('Invalid geometry.');
  if(n.kind==='text'&&(typeof n.text!=='string'||n.text.length>100_000))throw Error('Invalid text.');
  if(!['frame','group'].includes(String(n.kind))&&n.children.length)throw Error('Only frames and groups can contain layers.');
  ids.add(n.id);nodes.set(n.id,n as unknown as InterfaceNode);
 }
 const visited=new Set<string>();
 const walk=(id:string,pageId:string,parentId:string|null,depth:number)=>{
  const n=nodes.get(id);if(depth>MAX_DEPTH||visited.has(id)||!n||n.pageId!==pageId||n.parentId!==parentId)throw Error('Invalid, cyclic or oversized layer tree.');
  visited.add(id);for(const child of n.children)walk(child,pageId,n.id,depth+1);
 };
 for(const p of pages.values())for(const id of p.children)walk(id,p.id,null,1);
 if(visited.size!==nodes.size)throw Error('Unreachable layer.');
 validateInterfaceFeatures(d as unknown as InterfaceDocument);
 return d as unknown as InterfaceDocument;
}
export function serializeInterfaceDocument(d:InterfaceDocument):string{const text=JSON.stringify(d);parseInterfaceDocument(text);return text;}
export function insideInstance(d:InterfaceDocument,id:string):boolean{let node=d.nodes.find(n=>n.id===id);for(let depth=0;node&&depth<=64;depth++){if(node.instance)return true;node=node.parentId?d.nodes.find(n=>n.id===node!.parentId):undefined;}return false;}
export function addNode(d:InterfaceDocument,pageId:string,kind:NodeKind,parentId:string|null=null):string{
 const page=d.pages.find(p=>p.id===pageId);const parent=parentId?d.nodes.find(n=>n.id===parentId):null;
 if(!page||(parentId&&(!parent||parent.pageId!==pageId||!['frame','group'].includes(parent.kind)||parent.locked)))throw Error('Invalid parent.');
 if(parentId&&insideInstance(d,parentId))throw Error('Detach the instance before adding layers.');
 const id=uid();d.nodes.push({id,pageId,parentId,children:[],kind,name:kind[0].toUpperCase()+kind.slice(1),x:24,y:24,width:kind==='frame'?390:160,height:kind==='frame'?844:80,fill:kind==='frame'?'#ffffff':kind==='text'?'#202124':'#7756e8',...(kind==='text'?{text:'Your text'}:{}),hidden:false,locked:false});
 (parent?.children??page.children).push(id);return id;
}
export function deleteNode(d:InterfaceDocument,id:string):void{
 const n=d.nodes.find(n=>n.id===id);if(!n||n.locked)return;if(n.parentId&&insideInstance(d,n.parentId))throw Error('Detach the instance before deleting its layers.');
 const removing=new Set<string>();const walk=(id:string)=>{removing.add(id);d.nodes.find(n=>n.id===id)?.children.forEach(walk);};walk(id);
 const siblings=n.parentId?d.nodes.find(p=>p.id===n.parentId)!.children:d.pages.find(p=>p.id===n.pageId)!.children;
 siblings.splice(siblings.indexOf(id),1);d.nodes=d.nodes.filter(n=>!removing.has(n.id));
}
/** Reparent preserves absolute position; validation makes cycles an atomic failure. */
export function reparentNode(d:InterfaceDocument,id:string,parentId:string|null,index:number):void{
 const n=d.nodes.find(n=>n.id===id);if(!n||n.locked)throw Error('Layer unavailable.');if(n.parentId&&insideInstance(d,n.parentId)||parentId&&insideInstance(d,parentId))throw Error('Detach the instance before moving its layers.');
 const parent=parentId?d.nodes.find(p=>p.id===parentId):null;
 if(parentId&&(!parent||parent.pageId!==n.pageId||parent.locked||!['frame','group'].includes(parent.kind)))throw Error('Invalid parent.');
 const position=(node:InterfaceNode|null):[number,number]=>{let x=0,y=0,depth=0;while(node){if(++depth>MAX_DEPTH)throw Error('Cycle.');x+=node.x;y+=node.y;node=node.parentId?d.nodes.find(p=>p.id===node!.parentId)??null:null;}return [x,y];};
 const [x,y]=position(n),[px,py]=position(parent??null);
 const old=n.parentId?d.nodes.find(p=>p.id===n.parentId)!.children:d.pages.find(p=>p.id===n.pageId)!.children;
 old.splice(old.indexOf(id),1);const next=parent?.children??d.pages.find(p=>p.id===n.pageId)!.children;
 if(!Number.isInteger(index)||index<0||index>next.length)throw Error('Invalid insertion index.');
 next.splice(index,0,id);n.parentId=parentId;n.x=x-px;n.y=y-py;
}
