import {useLayoutEffect,useRef} from 'react';
/** One dashed page-break line over the grid, at a pixel position applied through the element's style object (not an inline style prop). */
export function SheetBreakLine({left,top,length,vertical,testId}:{left:number;top:number;length:number;vertical:boolean;testId?:string}){
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const el=ref.current;if(!el)return;el.style.left=`${left}px`;el.style.top=`${top}px`;if(vertical)el.style.height=`${length}px`;else el.style.width=`${length}px`;},[left,top,length,vertical]);
 return <div ref={ref} aria-hidden data-testid={testId} className={'pointer-events-none absolute z-[2] border-dashed border-accent '+(vertical?'w-0 border-l-2':'h-0 border-t-2')}/>;
}
