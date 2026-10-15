import {useLayoutEffect,useRef} from 'react';
/** A picture or shape drawn at a pixel box over the grid. The box is applied through the element's style object (not an inline style prop). */
export function SheetObjectImg({src,alt,left,top,width,height,z,testId}:{src:string;alt:string;left:number;top:number;width:number;height:number;z:number;testId?:string}){
 const ref=useRef<HTMLImageElement>(null);
 useLayoutEffect(()=>{const el=ref.current;if(!el)return;el.style.left=`${left}px`;el.style.top=`${top}px`;el.style.width=`${width}px`;el.style.height=`${height}px`;el.style.zIndex=String(z);},[left,top,width,height,z]);
 return <img ref={ref} src={src} alt={alt} draggable={false} data-testid={testId} className="pointer-events-none absolute"/>;
}
