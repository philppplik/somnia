import {useEffect,useRef,type RefObject} from 'react';

/**
 * Restores focus to whatever had it before a popup menu opened. Capture skips
 * elements already inside the menu root, so a menu that focuses its first item
 * on mount records the outside trigger, not the item.
 */
export function useMenuFocusReturn(open:boolean,root:RefObject<HTMLElement|null>):void{
 const trigger=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  if(!open)return;
  const ae=document.activeElement as HTMLElement|null;
  trigger.current=ae&&!root.current?.contains(ae)?ae:null;
  return()=>{const el=trigger.current;trigger.current=null;if(el&&document.contains(el))el.focus();};
 },[open,root]);
}
