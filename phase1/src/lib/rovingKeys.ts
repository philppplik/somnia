/**
 * Pure keyboard helpers for roving-focus widgets (tab lists, plain menus).
 * Follows the WAI-ARIA authoring practices: arrows wrap, Home/End jump to the ends.
 */
export type RovingOrientation='horizontal'|'vertical';
/** Index to focus after `key`, or null when the key is not a navigation key for this widget. */
export function rovingNextIndex(key:string,current:number,count:number,orientation:RovingOrientation):number|null{
 if(count<=0)return null;
 const next=orientation==='horizontal'?'ArrowRight':'ArrowDown',prev=orientation==='horizontal'?'ArrowLeft':'ArrowUp';
 if(key==='Home')return 0;
 if(key==='End')return count-1;
 if(key!==next&&key!==prev)return null;
 const from=current<0?(key===next?-1:0):current;
 return (from+(key===next?1:-1)+count)%count;
}
/** True for the keys that open a context menu from the keyboard. */
export const isContextMenuKey=(e:{key:string;shiftKey:boolean})=>e.key==='ContextMenu'||(e.key==='F10'&&e.shiftKey);
/** Move focus inside `root` among enabled `selector` matches. Returns whether the key was handled. */
export function handleRovingKeyDown(e:{key:string;preventDefault():void},root:ParentNode,selector:string,orientation:RovingOrientation,active:Element|null):boolean{
 const items=[...root.querySelectorAll<HTMLElement>(selector)].filter(x=>!(x as HTMLButtonElement).disabled&&x.getAttribute('aria-disabled')!=='true');
 const i=rovingNextIndex(e.key,items.findIndex(x=>x===active),items.length,orientation);
 if(i===null)return false;
 e.preventDefault();items[i].focus();return true;
}
