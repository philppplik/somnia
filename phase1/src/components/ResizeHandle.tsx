import { useRef } from 'react';
import { getState,patchState,useAppStore } from '../store/appStore';
export function ResizeHandle({side}:{side:'left'|'right'}){
 const state=useAppStore();const drag=useRef<{x:number;width:number}|null>(null);const key=side==='left'?'sidebarWidth':'inspectorWidth';const min=side==='left'?220:280;const max=side==='left'?380:400;
 const set=(width:number)=>patchState({[key]:Math.max(min,Math.min(max,width))});
 return <div role="separator" aria-label={`Resize ${side==='left'?'sidebar':'inspector'}`} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={state[key]} tabIndex={0} className="resize-handle" onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();set(getState()[key]+(event.key==='ArrowRight'?1:-1)*(side==='right'?-1:1)*(event.shiftKey?24:8));}}} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);drag.current={x:event.clientX,width:getState()[key]};}} onPointerMove={event=>{if(drag.current)set(drag.current.width+(event.clientX-drag.current.x)*(side==='right'?-1:1));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}/>;
}
