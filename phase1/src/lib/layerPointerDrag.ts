import {zoneFor} from './canvasDrag';
import type {DropZone} from './layerDrop';
export type LayerHint={id:string;zone:DropZone};
/** Pointer-based Layers drag works alongside Tauri native OS drops on Windows. */
export function installLayerPointerDrag(root:HTMLElement,callbacks:{start(id:string):void;hint(hit:LayerHint|null):void;end():void;drop(id:string,hit:LayerHint):void}){
 let down:{id:string;x:number;y:number;pointerId:number;row:HTMLElement}|null=null,dragging=false,hit:LayerHint|null=null;
 const end=()=>{const row=down?.row,pointerId=down?.pointerId;down=null;dragging=false;hit=null;if(row&&pointerId!==undefined&&row.hasPointerCapture(pointerId))row.releasePointerCapture(pointerId);callbacks.end();};
 const start=(e:PointerEvent)=>{if(e.button!==0||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey)return;
  const el=e.target as HTMLElement;const row=el.closest<HTMLElement>('[data-layer-id]');
  if(!row||row.dataset.layerDraggable!=='true'||(el.closest('button')&&!el.closest('[data-layer-drag-label]')))return;
  down={id:row.dataset.layerId!,x:e.clientX,y:e.clientY,pointerId:e.pointerId,row};
 };
 const move=(e:PointerEvent)=>{if(!down||e.pointerId!==down.pointerId)return;
  if(!dragging){if(Math.hypot(e.clientX-down.x,e.clientY-down.y)<6)return;dragging=true;down.row.setPointerCapture(e.pointerId);callbacks.start(down.id);}
  e.preventDefault();const row=root.ownerDocument.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-layer-id]');
  hit=row&&root.contains(row)?{id:row.dataset.layerId!,zone:zoneFor(e.clientY,row.getBoundingClientRect().top,row.getBoundingClientRect().height)}:null;
  callbacks.hint(hit);
 };
 const up=(e:PointerEvent)=>{if(!down||e.pointerId!==down.pointerId)return;const id=down.id,target=hit,was=dragging;
  if(was){e.preventDefault();const swallow=(event:Event)=>{event.preventDefault();event.stopPropagation();};root.addEventListener('click',swallow,{capture:true,once:true});setTimeout(()=>root.removeEventListener('click',swallow,true),0);}
  end();if(was&&target)callbacks.drop(id,target);
 };
 const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&down){e.preventDefault();end();}};
 root.addEventListener('pointerdown',start);root.addEventListener('pointermove',move);root.addEventListener('pointerup',up);root.addEventListener('pointercancel',end);root.addEventListener('lostpointercapture',end);root.ownerDocument.addEventListener('keydown',key);
 return()=>{end();root.removeEventListener('pointerdown',start);root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',up);root.removeEventListener('pointercancel',end);root.removeEventListener('lostpointercapture',end);root.ownerDocument.removeEventListener('keydown',key);};
}
