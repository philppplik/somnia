import {useLayoutEffect,useRef,type PointerEvent as ReactPointerEvent} from 'react';
/** A picture or shape drawn at a pixel box over the grid. The box is applied through the element's style object (not an inline style prop).
 *  With a pointer handler it can be picked up and dragged; `selected` draws an outline. */
export function SheetObjectImg({src,alt,left,top,width,height,z,testId,selected,onPointerDown}:{src:string;alt:string;left:number;top:number;width:number;height:number;z:number;testId?:string;selected?:boolean;onPointerDown?:(e:ReactPointerEvent<HTMLImageElement>)=>void}){
 const ref=useRef<HTMLImageElement>(null);
 useLayoutEffect(()=>{const el=ref.current;if(!el)return;el.style.left=`${left}px`;el.style.top=`${top}px`;el.style.width=`${width}px`;el.style.height=`${height}px`;el.style.zIndex=String(z);},[left,top,width,height,z]);
 return <img ref={ref} src={src} alt={alt} draggable={false} data-testid={testId} data-selected={selected?'true':undefined} onPointerDown={onPointerDown} className={'absolute '+(onPointerDown?'pointer-events-auto cursor-move touch-none ':'pointer-events-none ')+(selected?'outline outline-2 outline-accent':'')}/>;
}
/** The corner handle that resizes the selected object. */
export function SheetObjectHandle({left,top,onPointerDown,testId}:{left:number;top:number;onPointerDown:(e:ReactPointerEvent<HTMLDivElement>)=>void;testId?:string}){
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const el=ref.current;if(!el)return;el.style.left=`${left}px`;el.style.top=`${top}px`;el.style.zIndex='3';},[left,top]);
 return <div ref={ref} role="presentation" data-testid={testId} onPointerDown={onPointerDown} className="absolute size-3 cursor-se-resize touch-none rounded-sm bg-accent"/>;
}
