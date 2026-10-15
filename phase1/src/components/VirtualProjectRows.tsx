import {useEffect,useRef,useState,type ReactNode} from 'react';
import {projectTreeDestination} from '../lib/projectTree';
import type {ProjectRow} from '../lib/projectIndex';
/** Fixed 32px rows; only viewport + overscan enters the DOM. Keyboard focus keeps its row mounted. */
export function VirtualProjectRows({rows,active,collapsed,onToggle,render}:{rows:ProjectRow[];active:string;collapsed:ReadonlySet<string>;onToggle:(path:string)=>void;render:(row:ProjectRow)=>ReactNode}){
 const ref=useRef<HTMLDivElement>(null);const [top,setTop]=useState(0);const [height,setHeight]=useState(600);const [focused,setFocused]=useState<string|null>(null);
 useEffect(()=>{const el=ref.current;if(!el)return;const update=()=>setHeight(el.clientHeight);update();const observer=new ResizeObserver(update);observer.observe(el);return()=>observer.disconnect();},[]);
 useEffect(()=>{const el=ref.current;if(!el)return;const i=rows.findIndex(r=>r.path===active);if(i<0)return;const y=i*32;if(y<el.scrollTop||y+32>el.scrollTop+el.clientHeight){el.scrollTop=Math.max(0,y-el.clientHeight/2);setTop(el.scrollTop);}},[active,rows]);
 const start=Math.min(rows.length,Math.max(0,Math.floor(top/32)-8)),end=Math.min(rows.length,Math.ceil((top+height)/32)+8);
 const indices=new Set(Array.from({length:end-start},(_,i)=>start+i));const focusedIndex=rows.findIndex(r=>r.path===focused);if(focusedIndex>=0)indices.add(focusedIndex);
 return <div ref={ref} className="min-h-0 flex-1 overflow-auto" data-testid="virtual-project-rows" onScroll={e=>setTop(e.currentTarget.scrollTop)} onKeyDown={e=>{
   if(!(e.target instanceof HTMLButtonElement)||!e.target.hasAttribute('data-project-path'))return;
   const destination=projectTreeDestination(rows,e.target.dataset.projectPath??'',e.key,collapsed);if(!destination)return;
   e.preventDefault();if(destination.toggle)onToggle(destination.toggle);
   const next=rows.findIndex(row=>row.path===destination.path);setFocused(destination.path);
   e.currentTarget.scrollTop=Math.max(0,next*32-height/2);setTop(e.currentTarget.scrollTop);
   requestAnimationFrame(()=>{const buttons=ref.current?.querySelectorAll<HTMLButtonElement>('button[data-project-path]');for(const button of buttons??[])if(button.dataset.projectPath===destination.path){button.focus();break;}});
  }} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocused(null);}}>
  <div style={{height:rows.length*32,position:'relative'}}>{[...indices].sort((a,b)=>a-b).map(i=><div key={rows[i].path} data-row-index={i} style={{position:'absolute',top:i*32,height:32,left:0,right:0}} onFocus={()=>setFocused(rows[i].path)}>{render(rows[i])}</div>)}</div>
 </div>;
}
