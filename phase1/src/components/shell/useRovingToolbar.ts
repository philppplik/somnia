import {useEffect,useRef} from 'react';
import {applyRovingTabIndex} from '../../lib/rovingToolbar';
/** Attach to a role="toolbar" element. Keeps one Tab stop and follows focus; re-applies when buttons are added or removed. */
export function useRovingToolbar<T extends HTMLElement>(){
 const ref=useRef<T>(null);
 useEffect(()=>{
  const root=ref.current;if(!root)return;
  let current:Element|null=null;
  const apply=()=>{applyRovingTabIndex(root,current);};
  const focusIn=(e:FocusEvent)=>{if((e.target as HTMLElement).tagName==='BUTTON'&&root.contains(e.target as Node)){current=e.target as Element;apply();}};
  const mo=new MutationObserver(apply);
  mo.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','aria-pressed']});
  root.addEventListener('focusin',focusIn);apply();
  return()=>{mo.disconnect();root.removeEventListener('focusin',focusIn);};
 },[]);
 return ref;
}
