import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {ProjectRow} from '../lib/projectIndex';
/** Fixed 32px rows; only viewport + overscan enters the DOM. Keyboard focus keeps its row mounted. */
export function VirtualProjectRows({rows,active,render}:{rows:ProjectRow[];active:string;render:(row:ProjectRow)=>ReactNode}){
 const ref=useRef<HTMLDivElement>(null);const [top,setTop]=useState(0);const [height,setHeight]=useState(600);const [focused,setFocused]=useState<string|null>(null);
 useEffect(()=>{const el=ref.current;if(!el)return;const update=()=>setHeight(el.clientHeight);update();const observer=new ResizeObserver(update);observer.observe(el);return()=>observer.disconnect();},[]);
 useEffect(()=>{const el=ref.current;if(!el)return;const i=rows.findIndex(r=>r.path===active);if(i<0)return;const y=i*32;if(y<el.scrollTop||y+32>el.scrollTop+el.clientHeight){el.scrollTop=Math.max(0,y-el.clientHeight/2);setTop(el.scrollTop);}},[active,rows]);
 const start=Math.max(0,Math.floor(top/32)-8),end=Math.min(rows.length,Math.ceil((top+height)/32)+8);
 const indices=new Set(Array.from({length:end-start},(_,i)=>start+i));const focusedIndex=rows.findIndex(r=>r.path===focused);if(focusedIndex>=0)indices.add(focusedIndex);
 return <div ref={ref} className="min-h-0 flex-1 overflow-auto" data-testid="virtual-project-rows" onScroll={e=>setTop(e.currentTarget.scrollTop)} onKeyDown={e=>{
   if(!(e.target instanceof HTMLButtonElement)||!e.target.hasAttribute('aria-current'))return;
   const current=rows.findIndex(r=>r.path===focused);let next=current;
   if(e.key==='ArrowDown')next=Math.min(rows.length-1,current+1);else if(e.key==='ArrowUp')next=Math.max(0,current-1);else if(e.key==='Home')next=0;else if(e.key==='End')next=rows.length-1;else return;
   const step=e.key==='ArrowUp'?-1:1;while(next>=0&&next<rows.length&&rows[next].dir)next+=step;if(next<0||next>=rows.length)return;
   e.preventDefault();setFocused(rows[next].path);e.currentTarget.scrollTop=Math.max(0,next*32-height/2);setTop(e.currentTarget.scrollTop);
   requestAnimationFrame(()=>ref.current?.querySelector<HTMLButtonElement>(`[data-row-index="${next}"] button[aria-current]`)?.focus());
  }} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocused(null);}}>
  <div style={{height:rows.length*32,position:'relative'}}>{[...indices].sort((a,b)=>a-b).map(i=><div key={rows[i].path} data-row-index={i} style={{position:'absolute',top:i*32,height:32,left:0,right:0}} onFocus={()=>setFocused(rows[i].path)}>{render(rows[i])}</div>)}</div>
 </div>;
}
