import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {EditorNode} from '../lib/editorPort';
import {applyOperations,patchState,useAppStore,breakpointFor} from '../store/appStore';
import {moveLayer,duplicateLayer,deleteLayer,wrapLayer,unwrapLayer,indentLayer,outdentLayer} from '../lib/structureCommands';
import {tableAction,type TableAction} from '../lib/tableCommands';
/**
 * Right-click menu for the layer tree. A fixed-position menu in the app document (same mechanism as the canvas menu), so a click always runs the
 * action. Items fit the layer tree: inspect, reveal in code, order, duplicate, delete, visibility and lock.
 */
export function LayerContextMenu({node,children}:{node:EditorNode;children:ReactNode}){
 const s=useAppStore(),[pos,setPos]=useState<{x:number;y:number}|null>(null),root=useRef<HTMLDivElement>(null),close=()=>setPos(null);
 useEffect(()=>{if(!pos)return;root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};const down=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))close();};window.addEventListener('keydown',key);window.addEventListener('pointerdown',down);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',down);};},[pos]);
 const run=(action:()=>void)=>{try{action();}catch(error){patchState({notice:error instanceof Error?error.message:String(error)});}close();};
 const meta=(key:'locked'|'hidden')=>run(()=>{applyOperations([{type:'setMeta',file:s.designFile,nodeId:node.id,[key]:!node[key]}]);});
 const off=!s.coreConnected||node.locked;
 const items:Array<[string,()=>void,boolean]>=[
  ['Inspect '+node.tag,()=>run(()=>patchState({selectedElementId:node.id,selectedElementIds:[node.id],rightTab:'design',inspectorOpen:true})),false],
  ['View source',()=>run(()=>patchState({selectedElementId:node.id,selectedElementIds:[node.id],viewMode:s.viewMode==='design'?'split':s.viewMode})),false],
  ['Move up',()=>run(()=>moveLayer(node.id,-1)),off],
  ['Move down',()=>run(()=>moveLayer(node.id,1)),off],
  ['Duplicate',()=>run(()=>duplicateLayer(node.id)),off],
  ['Delete',()=>run(()=>deleteLayer(node.id)),off],
  ['Wrap in div',()=>run(()=>wrapLayer(node.id,'div')),off],
  ['Unwrap (keep content)',()=>run(()=>unwrapLayer(node.id)),off||!node.children.length],
  ['Indent (into previous sibling)',()=>run(()=>indentLayer(node.id)),off],
  ['Outdent (out of parent)',()=>run(()=>outdentLayer(node.id)),off],
  ...(['table','tr','td','th'].includes(node.tag)?([['Table: add row above','row.above'],['Table: add row below','row.below'],['Table: delete row','row.delete'],['Table: add column left','col.left'],['Table: add column right','col.right'],['Table: delete column','col.delete'],['Table: toggle header row','header'],['Table: merge cell with right neighbour','merge']] as Array<[string,TableAction]>).map(([l,a])=>[l,()=>run(()=>tableAction(a)),off] as [string,()=>void,boolean]):[]),
  ...(node.children.length?([['Layout: row, centered','row','center'],['Layout: row, spread out','row','space-between'],['Layout: column, centered','column','center'],['Layout: column, start','column','flex-start']] as const).map(([label,dir,jc])=>[label,()=>run(()=>{applyOperations([{type:'setStyle',file:s.designFile,nodeId:node.id,properties:{display:'flex','flex-direction':dir,'justify-content':jc,'align-items':'center'},breakpoint:breakpointFor(s.viewport)}]);patchState({notice:'Applied a flex layout rule to '+node.tag+'. Undo reverts it.'});}),off] as [string,()=>void,boolean]):[]),
  ...([['Align: center this block','margin-left:auto;margin-right:auto'],['Align: text left','text-align:left'],['Align: text center','text-align:center'],['Align: text right','text-align:right']] as const).map(([label,decl])=>[label,()=>run(()=>{const props:Record<string,string>=Object.fromEntries(decl.split(';').map(d=>d.split(':')));applyOperations([{type:'setStyle',file:s.designFile,nodeId:node.id,properties:props,breakpoint:breakpointFor(s.viewport)}]);patchState({notice:'Applied '+label.replace('Align: ','').toLowerCase()+' to '+node.tag+'. Undo reverts it.'});}),off] as [string,()=>void,boolean]),
  [node.hidden?'Show layer':'Hide layer',()=>meta('hidden'),!s.coreConnected],
  [node.locked?'Unlock layer':'Lock layer',()=>meta('locked'),!s.coreConnected]];
 return <div className="layer-context-trigger" onKeyDown={e=>{if((e.shiftKey&&e.key==="F10")||e.key==="ContextMenu"){e.preventDefault();const r=(e.target as HTMLElement).getBoundingClientRect();patchState({selectedElementId:node.id,selectedElementIds:[node.id]});setPos({x:Math.min(r.left+24,window.innerWidth-240),y:Math.min(r.bottom,window.innerHeight-300)});}}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();patchState({selectedElementId:node.id,selectedElementIds:[node.id]});setPos({x:Math.min(e.clientX,window.innerWidth-240),y:Math.min(e.clientY,window.innerHeight-300)});}}>{children}{pos&&<div ref={root} role="menu" aria-label={`${node.tag} layer actions`} className="menu-popup" style={{position:'fixed',left:pos.x,top:Math.max(8,Math.min(pos.y,window.innerHeight-Math.min(items.length*34+16,window.innerHeight-16)-8)),maxHeight:window.innerHeight-16,overflowY:'auto',zIndex:60}}>{items.map(([label,fn,disabled])=><button key={label} role="menuitem" className="menu-item" style={{width:'100%',background:'none',border:0,textAlign:'left'}} disabled={disabled} aria-disabled={disabled?true:undefined} onClick={fn}>{label}</button>)}</div>}</div>;
}
