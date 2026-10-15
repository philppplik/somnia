import {useLayoutEffect,useRef} from 'react';
/** The small color mark on a sheet tab. The color is applied through the element's style object (not an inline style prop). */
export function SheetTabDot({color,testId}:{color:string;testId?:string}){
 const ref=useRef<HTMLSpanElement>(null);
 useLayoutEffect(()=>{const el=ref.current;if(el)el.style.backgroundColor=color;},[color]);
 return <span ref={ref} aria-hidden="true" data-testid={testId} className="mr-1.5 inline-block size-2 rounded-full align-middle"/>;
}
