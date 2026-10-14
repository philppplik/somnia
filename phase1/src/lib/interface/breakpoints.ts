import {parseInterfaceDocument,serializeInterfaceDocument,uid,type InterfaceDocument,type InterfaceNode} from './model';
import {computeInterfaceLayout,type LayoutResult} from './layout';
import {resizeInterfaceFrame,validateInterfaceFrameSize} from './responsive';
import {resolveInterfaceValues,resolvedTextStyle} from './tokens';
import type {InterfaceBreakpoint} from './schema';
export const MAX_INTERFACE_BREAKPOINTS=8;
export interface ResponsiveIssue {id:string;breakpoint:string;kind:'overflow'|'text-clipped'|'overlap';name:string;params:Record<string,string>;}
export interface ResponsiveAudit {issues:ResponsiveIssue[];checked:number;}
const MAX_ISSUES=200;
const frame=(doc:InterfaceDocument,frameId:string)=>{const n=doc.nodes.find(n=>n.id===frameId);if(!n||n.kind!=='frame')throw Error('Select a frame layer.');if(n.locked)throw Error('Layer is locked or unavailable.');return n;};
/** Adding a breakpoint is one caller transaction, so undo restores the previous list in one step. */
export function addInterfaceBreakpoint(doc:InterfaceDocument,frameId:string,input:{name:string;width:number;height:number}):string{
 const node=frame(doc,frameId),name=input.name.trim(),{width,height}=validateInterfaceFrameSize(input);
 if(!name||name.length>64)throw Error('A breakpoint name is required.');
 const list=node.breakpoints??=[];if(list.length>=MAX_INTERFACE_BREAKPOINTS)throw Error('Breakpoint limit reached.');
 if(list.some(b=>b.name.toLowerCase()===name.toLowerCase()))throw Error('Breakpoint names must be unique.');
 const bp:InterfaceBreakpoint={id:uid(),name,width,height};list.push(bp);return bp.id;
}
/** Removing a breakpoint is one caller transaction; the frame itself is not resized. */
export function removeInterfaceBreakpoint(doc:InterfaceDocument,frameId:string,breakpointId:string){const node=frame(doc,frameId),index=(node.breakpoints??[]).findIndex(b=>b.id===breakpointId);if(index<0)throw Error('Breakpoint unavailable.');node.breakpoints!.splice(index,1);if(!node.breakpoints!.length)delete node.breakpoints;}
/** Applying a breakpoint resizes the frame through the shared path, joining history as one undoable transaction. */
export function applyInterfaceBreakpoint(doc:InterfaceDocument,frameId:string,breakpointId:string){const node=frame(doc,frameId),bp=(node.breakpoints??[]).find(b=>b.id===breakpointId);if(!bp)throw Error('Breakpoint unavailable.');resizeInterfaceFrame(doc,frameId,{width:bp.width,height:bp.height});}
const descendants=(doc:InterfaceDocument,rootId:string)=>{const out:InterfaceNode[]=[];const walk=(id:string)=>{for(const c of doc.nodes.find(n=>n.id===id)?.children??[]){const n=doc.nodes.find(x=>x.id===c);if(n){out.push(n);walk(c);}}};walk(rootId);return out;};
const overlaps=(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number})=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))>1;
/** Display-only review: every breakpoint renders on an isolated resolved copy; the source, history and recovery stay untouched. */
export function auditInterfaceResponsive(source:InterfaceDocument,frameId:string):ResponsiveAudit{
 const origin=source.nodes.find(n=>n.id===frameId);if(!origin||origin.kind!=='frame')throw Error('Select a frame layer.');
 const issues:ResponsiveIssue[]=[];let checked=0;
 for(const bp of origin.breakpoints??[]){
  checked++;const capped=()=>issues.length>=MAX_ISSUES;
  const doc=resolveInterfaceValues(parseInterfaceDocument(serializeInterfaceDocument(source))).document;resizeInterfaceFrame(doc,frameId,{width:bp.width,height:bp.height});
  const layout:LayoutResult=computeInterfaceLayout(doc),fb=layout.bounds.get(frameId);if(!fb)continue;
  const size={width:String(bp.width),height:String(bp.height)},push=(kind:ResponsiveIssue['kind'],n:InterfaceNode,extra:Record<string,string>={})=>{if(!capped())issues.push({id:`${bp.id}:${n.id}:${kind}:${extra.other??''}`,breakpoint:bp.name,kind,name:n.name,params:{name:n.name,breakpoint:bp.name,...size,...extra}});};
  for(const n of descendants(doc,frameId)){
   if(n.hidden)continue;const b=layout.bounds.get(n.id);if(!b)continue;
   if(b.x<fb.x-.5||b.y<fb.y-.5||b.x+b.width>fb.x+fb.width+.5||b.y+b.height>fb.y+fb.height+.5)push('overflow',n);
   if(n.kind==='text'&&(n.text??'').trim()&&(n.sizing?.height??'fixed')!=='hug'){const style=resolvedTextStyle(doc,n),need=(n.text??'').split('\n').length*style.fontSize*style.lineHeight;if(need>b.height+1)push('text-clipped',n);}
  }
  for(const container of [doc.nodes.find(n=>n.id===frameId)!,...descendants(doc,frameId).filter(n=>['frame','group'].includes(n.kind))]){
   if(container.layout&&container.layout.direction!=='free')continue;const kids=container.children.map(id=>doc.nodes.find(n=>n.id===id)).filter((n):n is InterfaceNode=>!!n&&!n.hidden&&!(n.sizing?.absolute??false));
   if(kids.length>50)continue;
   for(let i=0;i<kids.length;i++)for(let j=i+1;j<kids.length;j++){const a=layout.bounds.get(kids[i].id),b=layout.bounds.get(kids[j].id);if(a&&b&&overlaps(a,b))push('overlap',kids[i],{other:kids[j].name});}
  }
 }
 return {issues,checked};
}
