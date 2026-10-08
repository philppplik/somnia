import {dropLayer} from './structureCommands';
import {getState,patchState} from '../store/appStore';
import type {DropZone} from './layerDrop';
export type DropHint={x:number;y:number;w:number;h:number;zone:DropZone;label?:string}|null;
const PROTECTED=new Set(['html','head','body']);
export const zoneFor=(y:number,top:number,height:number):DropZone=>{const f=(y-top)/Math.max(height,1);return f<0.3?'before':f>0.7?'after':'inside';};
/** Pointer drag inside the design iframe: move the pressed element before, after or into the element under the pointer. Reuses the Layers drop planner (dropLayer), so locked layers, protected roots and invalid targets are refused the same way and one undo restores the position. Escape cancels. */
export function installCanvasDrag(doc:Document,onHint:(hint:DropHint)=>void){
 let down:{id:string;x:number;y:number}|null=null,dragging=false,target:{id:string;zone:DropZone}|null=null;
 const nodeAt=(el:Element|null)=>el?.closest('[data-editor-node]')??null;
 // Temporary stylesheet avoids overwriting author styles, including descendant user-select rules.
 let selectionStyle:HTMLStyleElement|null=null,previousCursor='',previousCursorPriority='';
 const end=()=>{if(dragging){selectionStyle?.remove();selectionStyle=null;doc.documentElement.style.setProperty('cursor',previousCursor,previousCursorPriority);}down=null;dragging=false;target=null;onHint(null);};
 doc.addEventListener('selectstart',e=>{if(dragging)e.preventDefault();},true);
 // Native text/image drags must not take over our pointer-based element move.
 doc.addEventListener('dragstart',e=>{if(down)e.preventDefault();},true);
 doc.defaultView?.addEventListener('blur',end);

 doc.addEventListener('pointerdown',e=>{if(e.button!==0||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey)return;const t=nodeAt(e.target as Element);if(!t)return;const id=t.getAttribute('data-editor-node')!;const tag=t.tagName.toLowerCase();if(PROTECTED.has(tag))return;const node=(()=>{let r:{locked:boolean}|undefined;const w=(ns:{id:string;locked:boolean;children:unknown[]}[])=>{for(const n of ns){if(n.id===id)r=n;if(!r)w(n.children as never);}};w(getState().nodes as never);return r;})();if(!node||node.locked)return;down={id,x:e.clientX,y:e.clientY};},true);
 doc.addEventListener('pointermove',e=>{if(!down)return;if(!dragging){if(Math.hypot(e.clientX-down.x,e.clientY-down.y)<6)return;dragging=true;previousCursor=doc.documentElement.style.getPropertyValue('cursor');previousCursorPriority=doc.documentElement.style.getPropertyPriority('cursor');selectionStyle=doc.createElement('style');selectionStyle.textContent=':root, :root * { user-select: none !important; -webkit-user-select: none !important; }';doc.head.append(selectionStyle);doc.getSelection()?.removeAllRanges();doc.documentElement.style.cursor='grabbing';patchState({selectedElementId:down.id,selectedElementIds:[down.id]});}
  e.preventDefault();const over=nodeAt(doc.elementFromPoint(e.clientX,e.clientY));if(!over){target=null;onHint(null);return;}const id=over.getAttribute('data-editor-node')!;if(id===down.id||over.closest(`[data-editor-node="${down.id}"]`)){target=null;onHint(null);return;}
  const r=over.getBoundingClientRect();const zone=zoneFor(e.clientY,r.top,r.height);target={id,zone};onHint({x:r.x,y:r.y,w:r.width,h:r.height,zone});},true);
 doc.addEventListener('pointerup',e=>{if(!down)return;const was=dragging,drag=down,hit=target;if(was){e.preventDefault();const swallow=(ev:Event)=>{ev.stopPropagation();ev.preventDefault();};doc.addEventListener('click',swallow,{capture:true,once:true});setTimeout(()=>doc.removeEventListener('click',swallow,true),0);}end();if(was&&hit){try{dropLayer(drag.id,hit.id,hit.zone);}catch(error){patchState({notice:String(error)});}}},true);
 doc.addEventListener('pointercancel',end,true);
 doc.addEventListener('keydown',e=>{if(e.key==='Escape'&&(down||dragging)){end();}},true);
}
