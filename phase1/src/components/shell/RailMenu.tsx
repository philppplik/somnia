import {useEffect,useRef} from 'react';
export interface RailMenuItem{label:string;onClick:()=>void;disabled?:boolean;separator?:boolean}
/** Small fixed-position menu for rail icons (context menu and overflow). Escape or an outside press closes it. */
export function RailMenu({x,y,label,items,onClose}:{x:number;y:number;label:string;items:readonly RailMenuItem[];onClose:()=>void}){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};
  const down=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))onClose();};
  window.addEventListener('keydown',key);window.addEventListener('pointerdown',down);
  return()=>{window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',down);};
 },[onClose]);
 return <div ref={root} role="menu" aria-label={label} data-testid="rail-menu" className="menu-popup" style={{position:'fixed',left:x,top:y,zIndex:50}}>
  {items.map((it,i)=>it.separator?<div key={i} role="separator" className="my-1 h-px bg-line"/>:<button key={i} role="menuitem" className="menu-item" style={{width:'100%',background:'none',border:0,textAlign:'left'}} disabled={it.disabled} onClick={()=>{it.onClick();onClose();}}>{it.label}</button>)}
 </div>;
}
