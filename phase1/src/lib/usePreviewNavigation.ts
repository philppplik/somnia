import {useCallback,useEffect,useRef,useState} from 'react';
import {getProjectGeneration,patchState} from '../store/appStore';
import {newPreviewHistory,resolvePreviewLink,visitPreview} from './previewNavigation';
import {readPreviewHtml} from './previewProjectLinks';
import {openPreviewExternal} from './previewExternal';
export function usePreviewNavigation(files:Readonly<Record<string,string>>,initialFile:string){
 const [loaded,setLoaded]=useState<Record<string,string>>({});const generation=getProjectGeneration();const [history,setHistory]=useState(()=>newPreviewHistory(initialFile));
 const ref=useRef(history);ref.current=history;
 const latest=useRef(files);latest.current=files;
 useEffect(()=>{setHistory(newPreviewHistory(initialFile));setLoaded({});},[initialFile,generation]);
 const current=history.entries[history.index];
 const navigate=useCallback((href:string)=>{
  const h=ref.current;const result=resolvePreviewLink(latest.current,h.entries[h.index].file,href,true);
  if(result.kind==='local'){
   if(Object.hasOwn(latest.current,result.file))setHistory(old=>visitPreview(old,result));
   else {const generation=getProjectGeneration();void readPreviewHtml(result.file).then(text=>{if(text===null||generation!==getProjectGeneration()||ref.current!==h)return;setLoaded(old=>({...old,[result.file]:text}));setHistory(old=>visitPreview(old,result));}).catch(()=>{});}
  }
  else if(result.kind==='external'&&navigator.userActivation?.isActive)void openPreviewExternal(result.url).catch(()=>patchState({notice:'Could not open the system browser.'}));
 },[]);
 const rememberScroll=useCallback((y:number)=>{if(!Number.isFinite(y)||y<0)return;setHistory(h=>({...h,entries:h.entries.map((v,i)=>i===h.index?{...v,y}:v)}));},[]);
 // The visited page never changes the editor's active document.
 const go=useCallback((offset:number)=>setHistory(()=>{const h=ref.current;return {...h,index:Math.max(0,Math.min(h.entries.length-1,h.index+offset))};}),[]);
 return {files:{...loaded,...files},visitIndex:history.index,file:current.file,hash:current.hash,y:current.y,canBack:history.index>0,canForward:history.index<history.entries.length-1,go,navigate,rememberScroll};
}
