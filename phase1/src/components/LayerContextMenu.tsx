import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {EditorNode} from '../lib/editorPort';
import {applyOperations,patchState,useAppStore} from '../store/appStore';
import {moveLayer,duplicateLayer,deleteLayer} from '../lib/structureCommands';
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
  [node.hidden?'Show layer':'Hide layer',()=>meta('hidden'),!s.coreConnected],
  [node.locked?'Unlock layer':'Lock layer',()=>meta('locked'),!s.coreConnected]];
 return <div className="layer-context-trigger" onKeyDown={e=>{if((e.shiftKey&&e.key==="F10")||e.key==="ContextMenu"){e.preventDefault();const r=(e.target as HTMLElement).getBoundingClientRect();patchState({selectedElementId:node.id,selectedElementIds:[node.id]});setPos({x:Math.min(r.left+24,window.innerWidth-240),y:Math.min(r.bottom,window.innerHeight-300)});}}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();patchState({selectedElementId:node.id,selectedElementIds:[node.id]});setPos({x:Math.min(e.clientX,window.innerWidth-240),y:Math.min(e.clientY,window.innerHeight-300)});}}>{children}{pos&&<div ref={root} role="menu" aria-label={`${node.tag} layer actions`} className="menu-popup" style={{position:'fixed',left:pos.x,top:pos.y,zIndex:60}}>{items.map(([label,fn,disabled])=><button key={label} role="menuitem" className="menu-item" style={{width:'100%',background:'none',border:0,textAlign:'left'}} disabled={disabled} aria-disabled={disabled?true:undefined} onClick={fn}>{label}</button>)}</div>}</div>;
}
