import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {EditorNode} from '../lib/editorPort';
import {applyOperations,patchState,useAppStore,breakpointFor} from '../store/appStore';
import {useT} from '../lib/useT';
import {moveLayer,duplicateLayer,deleteLayer,wrapLayer,unwrapLayer,indentLayer,outdentLayer} from '../lib/structureCommands';
import {tableAction,type TableAction} from '../lib/tableCommands';
/**
 * Right-click menu for the layer tree. A fixed-position menu in the app document (same mechanism as the canvas menu), so a click always runs the
 * action. Items fit the layer tree: inspect, reveal in code, order, duplicate, delete, visibility and lock.
 */
export function LayerContextMenu({node,children}:{node:EditorNode;children:ReactNode}){
 const {t}=useT();const s=useAppStore(),[pos,setPos]=useState<{x:number;y:number}|null>(null),root=useRef<HTMLDivElement>(null),close=()=>setPos(null);
 useEffect(()=>{if(!pos)return;root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};const down=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))close();};window.addEventListener('keydown',key);window.addEventListener('pointerdown',down);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',down);};},[pos]);
 const run=(action:()=>void)=>{try{action();}catch(error){patchState({notice:error instanceof Error?error.message:String(error)});}close();};
 const meta=(key:'locked'|'hidden')=>run(()=>{applyOperations([{type:'setMeta',file:s.designFile,nodeId:node.id,[key]:!node[key]}]);});
 const off=!s.coreConnected||node.locked;
 const items:Array<[string,()=>void,boolean]>=[
  [t('ctx.inspect',{tag:node.tag}),()=>run(()=>patchState({selectedElementId:node.id,selectedElementIds:[node.id],rightTab:'design',inspectorOpen:true})),false],
  [t('ctx.viewSource'),()=>run(()=>patchState({selectedElementId:node.id,selectedElementIds:[node.id],viewMode:s.viewMode==='design'?'split':s.viewMode})),false],
  [t('ctx.moveUp'),()=>run(()=>moveLayer(node.id,-1)),off],
  [t('ctx.moveDown'),()=>run(()=>moveLayer(node.id,1)),off],
  [t('ctx.duplicate'),()=>run(()=>duplicateLayer(node.id)),off],
  [t('ctx.delete'),()=>run(()=>deleteLayer(node.id)),off],
  [t('ctx.wrap'),()=>run(()=>wrapLayer(node.id,'div')),off],
  [t('ctx.unwrap'),()=>run(()=>unwrapLayer(node.id)),off||!node.children.length],
  [t('ctx.indent'),()=>run(()=>indentLayer(node.id)),off],
  [t('ctx.outdent'),()=>run(()=>outdentLayer(node.id)),off],
  ...(['table','tr','td','th'].includes(node.tag)?([[t('ctx.rowAbove'),'row.above'],[t('ctx.rowBelow'),'row.below'],[t('ctx.rowDelete'),'row.delete'],[t('ctx.colLeft'),'col.left'],[t('ctx.colRight'),'col.right'],[t('ctx.colDelete'),'col.delete'],[t('ctx.headerRow'),'header'],[t('ctx.mergeCell'),'merge']] as Array<[string,TableAction]>).map(([l,a])=>[l,()=>run(()=>tableAction(a)),off] as [string,()=>void,boolean]):[]),
  ...(node.children.length?([[t('ctx.layoutRowCenter'),'row','center'],[t('ctx.layoutRowSpread'),'row','space-between'],[t('ctx.layoutColCenter'),'column','center'],[t('ctx.layoutColStart'),'column','flex-start']] as const).map(([label,dir,jc])=>[label,()=>run(()=>{applyOperations([{type:'setStyle',file:s.designFile,nodeId:node.id,properties:{display:'flex','flex-direction':dir,'justify-content':jc,'align-items':'center'},breakpoint:breakpointFor(s.viewport)}]);patchState({notice:t('ctx.flexApplied',{tag:node.tag})});}),off] as [string,()=>void,boolean]):[]),
  ...([[t('ctx.alignBlock'),'margin-left:auto;margin-right:auto'],[t('ctx.alignLeft'),'text-align:left'],[t('ctx.alignCenter'),'text-align:center'],[t('ctx.alignRight'),'text-align:right']] as const).map(([label,decl])=>[label,()=>run(()=>{const props:Record<string,string>=Object.fromEntries(decl.split(';').map(d=>d.split(':')));applyOperations([{type:'setStyle',file:s.designFile,nodeId:node.id,properties:props,breakpoint:breakpointFor(s.viewport)}]);patchState({notice:t('ctx.alignApplied',{label:label.replace(/^[^:]+:\s*/,'').toLowerCase(),tag:node.tag})});}),off] as [string,()=>void,boolean]),
  [node.hidden?t('ctx.show'):t('ctx.hide'),()=>meta('hidden'),!s.coreConnected],
  [node.locked?t('ctx.unlock'):t('ctx.lock'),()=>meta('locked'),!s.coreConnected]];
 return <div className="layer-context-trigger" onKeyDown={e=>{if((e.shiftKey&&e.key==="F10")||e.key==="ContextMenu"){e.preventDefault();const r=(e.target as HTMLElement).getBoundingClientRect();patchState({selectedElementId:node.id,selectedElementIds:[node.id]});setPos({x:Math.min(r.left+24,window.innerWidth-240),y:Math.min(r.bottom,window.innerHeight-300)});}}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();patchState({selectedElementId:node.id,selectedElementIds:[node.id]});setPos({x:Math.min(e.clientX,window.innerWidth-240),y:Math.min(e.clientY,window.innerHeight-300)});}}>{children}{pos&&<div ref={root} role="menu" aria-label={t('ctx.layerActions',{tag:node.tag})} className="menu-popup" style={{position:'fixed',left:pos.x,top:Math.max(8,Math.min(pos.y,window.innerHeight-Math.min(items.length*34+16,window.innerHeight-16)-8)),maxHeight:window.innerHeight-16,overflowY:'auto',zIndex:60}}>{items.map(([label,fn,disabled])=><button key={label} role="menuitem" className="menu-item" style={{width:'100%',background:'none',border:0,textAlign:'left'}} disabled={disabled} aria-disabled={disabled?true:undefined} onClick={fn}>{label}</button>)}</div>}</div>;
}
