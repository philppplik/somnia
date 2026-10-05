import {useEffect,useRef} from 'react';
import type {EditorNode} from '../lib/editorPort';
import {applyOperations,patchState,useAppStore} from '../store/appStore';
import {useT} from '../lib/useT';
import {moveLayer,duplicateLayer,deleteLayer} from '../lib/structureCommands';
export interface CanvasMenuState{id:string;x:number;y:number}
/** Right-click menu for the design canvas. Same actions as the layer menu, shared core transactions and undo. Fixed-position in the app document so it is never clipped or scaled by the iframe. */
export function CanvasContextMenu({menu,node,onClose}:{menu:CanvasMenuState;node:EditorNode|undefined;onClose:()=>void}){
 const {t}=useT();const s=useAppStore(),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};const down=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))onClose();};window.addEventListener('keydown',key);window.addEventListener('pointerdown',down);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',down);};},[onClose]);
 if(!node)return null;
 const run=(action:()=>void)=>{try{action();}catch(error){patchState({notice:error instanceof Error?error.message:String(error)});}onClose();};
 const meta=(key:'locked'|'hidden')=>run(()=>{applyOperations([{type:'setMeta',file:s.designFile,nodeId:node.id,[key]:!node[key]}]);});
 const items:Array<[string,()=>void,boolean]>=[
  [t('ctx.select',{tag:node.tag}),()=>run(()=>patchState({selectedElementId:node.id,selectedElementIds:[node.id],rightTab:'design'})),false],
  [t('ctx.moveUp'),()=>run(()=>moveLayer(node.id,-1)),!!node.locked],
  [t('ctx.moveDown'),()=>run(()=>moveLayer(node.id,1)),!!node.locked],
  [t('ctx.duplicate'),()=>run(()=>duplicateLayer(node.id)),!!node.locked],
  [t('ctx.delete'),()=>run(()=>deleteLayer(node.id)),!!node.locked],
  [node.hidden?t('ctx.show'):t('ctx.hide'),()=>meta('hidden'),false],
  [node.locked?t('ctx.unlock'):t('ctx.lock'),()=>meta('locked'),false]];
 return <div ref={root} role="menu" aria-label={t('ctx.canvasActions')} className="menu-popup canvas-context-menu" style={{position:'fixed',left:menu.x,top:menu.y}}>{items.map(([label,fn,disabled])=><button key={label} role="menuitem" className="menu-item" style={{width:'100%',background:'none',border:0,textAlign:'left'}} disabled={disabled} onClick={fn}>{label}</button>)}</div>;
}
