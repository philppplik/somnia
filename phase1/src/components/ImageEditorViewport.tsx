import { useEffect, useRef, useState } from 'react';
import { fitViewport, panBy, zoomAt } from '../lib/image-editor/viewport';
import type { Viewport } from '../lib/image-editor/types';
export interface ImageEditorViewportProps {
  image: HTMLCanvasElement | null;
  viewport?: Viewport;
  onViewportChange?: (viewport:Viewport)=>void;
  onImagePointer?: (point:{x:number;y:number},event:React.PointerEvent<HTMLCanvasElement>)=>void;
  onImagePointerMove?: ImageEditorViewportProps['onImagePointer'];
  onImagePointerUp?: ImageEditorViewportProps['onImagePointer'];
  onImagePointerCancel?: () => void;
  overlay?: React.ReactNode;
}
/** Overlay children share screen coordinates; inverse transform helpers are exported by the core. */
export function ImageEditorViewport({image,viewport,onViewportChange,onImagePointer,onImagePointerMove,onImagePointerUp,onImagePointerCancel,overlay}:ImageEditorViewportProps) {
  const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),drag=useRef<{x:number;y:number;id:number}|null>(null);
  const [local,setLocal]=useState<Viewport>({x:0,y:0,zoom:1});const view=viewport ?? local;
  const change=(next:Viewport)=>{setLocal(next);onViewportChange?.(next);};
  const latest=useRef({view,change,image});latest.current={view,change,image};
  useEffect(()=>{
    const node=host.current;if(!node)return;
    const resize=new ResizeObserver(()=>{
      const {image,change}=latest.current;if(image && !viewport)change(fitViewport(image,{width:node.clientWidth,height:node.clientHeight}));
    });resize.observe(node);return()=>resize.disconnect();
  },[viewport]);
  useEffect(()=>{const node=host.current;if(node&&image&&!viewport)change(fitViewport(image,{width:node.clientWidth,height:node.clientHeight}));},[image]);
  useEffect(()=>{
    const node=host.current;if(!node)return;
    const wheel=(event:WheelEvent)=>{event.preventDefault();const rect=node.getBoundingClientRect(),{view,change}=latest.current;
      change(zoomAt(view,view.zoom*Math.exp(-event.deltaY*0.002),{x:event.clientX-rect.left,y:event.clientY-rect.top}));};
    node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);
  },[]);
  useEffect(()=>{
    const target=canvas.current;if(!target)return;
    const draw=()=>{const node=host.current;if(!node)return;const dpr=window.devicePixelRatio||1;
      target.width=Math.max(1,Math.round(node.clientWidth*dpr));target.height=Math.max(1,Math.round(node.clientHeight*dpr));
      const ctx=target.getContext('2d');if(!ctx)return;ctx.scale(dpr,dpr);ctx.clearRect(0,0,node.clientWidth,node.clientHeight);
      if(image){ctx.imageSmoothingEnabled=view.zoom<2;ctx.drawImage(image,view.x,view.y,image.width*view.zoom,image.height*view.zoom);}
    };draw();const observer=new ResizeObserver(draw);if(host.current)observer.observe(host.current);return()=>observer.disconnect();
  },[image,view]);
  return <div ref={host} role="region" aria-label="Image editing viewport" style={{position:'relative',width:'100%',height:'100%',overflow:'hidden',background:'repeating-conic-gradient(#8882 0% 25%,transparent 0% 50%) 0 / 16px 16px'}}>
    <canvas ref={canvas} tabIndex={0} aria-label="Image canvas. Drag with middle mouse to pan; scroll to zoom. Plus and minus zoom; zero fits image." style={{width:'100%',height:'100%',display:'block',touchAction:'none'}}
      onPointerDown={event=>{if(event.button===1 || event.button===0 && event.altKey){event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={x:event.clientX,y:event.clientY,id:event.pointerId};}
        else if(onImagePointer && event.button===0){event.currentTarget.setPointerCapture(event.pointerId);const r=event.currentTarget.getBoundingClientRect();onImagePointer({x:(event.clientX-r.left-view.x)/view.zoom,y:(event.clientY-r.top-view.y)/view.zoom},event);}}}
      onPointerMove={event=>{if(drag.current?.id!==event.pointerId){if(onImagePointerMove){const r=event.currentTarget.getBoundingClientRect();onImagePointerMove({x:(event.clientX-r.left-view.x)/view.zoom,y:(event.clientY-r.top-view.y)/view.zoom},event);}return;}const last=drag.current;change(panBy(view,{x:event.clientX-last.x,y:event.clientY-last.y}));drag.current={x:event.clientX,y:event.clientY,id:event.pointerId};}}
      onPointerUp={event=>{if(!drag.current && onImagePointerUp){const r=event.currentTarget.getBoundingClientRect();onImagePointerUp({x:(event.clientX-r.left-view.x)/view.zoom,y:(event.clientY-r.top-view.y)/view.zoom},event);}drag.current=null;}} onPointerCancel={()=>{drag.current=null;onImagePointerCancel?.();}} onLostPointerCapture={()=>{drag.current=null;onImagePointerCancel?.();}}
      onKeyDown={event=>{const node=host.current;if(!node)return;const anchor={x:node.clientWidth/2,y:node.clientHeight/2};
        if(['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))event.preventDefault();
        if(event.key==='+'||event.key==='=')change(zoomAt(view,view.zoom*1.25,anchor));else if(event.key==='-')change(zoomAt(view,view.zoom/1.25,anchor));else if(event.key==='0'&&image)change(fitViewport(image,{width:node.clientWidth,height:node.clientHeight}));
        else if(event.key.startsWith('Arrow'))change(panBy(view,{x:event.key==='ArrowLeft'?32:event.key==='ArrowRight'?-32:0,y:event.key==='ArrowUp'?32:event.key==='ArrowDown'?-32:0}));}} />
    {overlay}
  </div>;
}
