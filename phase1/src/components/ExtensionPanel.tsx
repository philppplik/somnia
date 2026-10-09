import {useT} from '../lib/useT';
import {useEffect,useMemo,useRef,useState} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {callApi} from '../lib/extensions/api';
import {loadActiveExtensions} from '../lib/extensions/registry';
import {panelSrcdoc,panelUrl} from '../lib/extensions/panelHtml';
import {PanelSession} from '../lib/extensions/panelSession';
import {getState,patchState,useAppStore} from '../store/appStore';
const newToken=()=>{const b=new Uint8Array(16);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');};
/** Sidebar or inspector body contributed by an extension. Native builds load it as its own document (somnia-ext://panel/<ext>/<panel>) inside a sandbox="allow-scripts" frame; web builds use srcdoc. API calls travel only over a per-session MessagePort (see panelSession.ts), so a frame that navigates loses all authority, and the host removes it on any second load. The app CSP frame-src refuses external frame navigation. */
export function ExtensionPanel({id}:{id:string}){
 const {t}=useT();
 const panel=useAppStore().extensionPanels.find(p=>p.id===id);const frame=useRef<HTMLIFrameElement>(null);
 const [navigated,setNavigated]=useState(false);
 const token=useMemo(newToken,[panel?.id,panel?.html]);
 const session=useMemo(()=>{if(!panel)return null;
  return new PanelSession({token,onNavigated:()=>setNavigated(true),handle:(method,args)=>{
   const ext=loadActiveExtensions().find(x=>x.id===panel.extId);if(!ext)throw new Error('Extension is not active.');
   return callApi(ext,method,args,{files:()=>getState().files as Record<string,string>,selection:()=>{const sel=getState().selectedElementId;let hit:{id:string;tag:string}|null=null;const walk=(ns:{id:string;tag:string;children:any[]}[])=>ns.forEach(n=>{if(n.id===sel)hit={id:n.id,tag:n.tag};walk(n.children);});walk(getState().nodes as never);return hit;},notify:t=>patchState({notice:t}),registerHandler:()=>{},storage:{get:k=>localStorage.getItem(`somnia.ext.${ext.id}.${k}`),set:(k,v)=>localStorage.setItem(`somnia.ext.${ext.id}.${k}`,v)}});}});
 },[panel,token]);
 useEffect(()=>{setNavigated(false);},[panel?.id,panel?.html]);
 useEffect(()=>{if(!session)return;const on=(e:MessageEvent)=>{session.onWindowMessage(e.source,frame.current?.contentWindow??null,e.data);};
  window.addEventListener('message',on);return()=>{window.removeEventListener('message',on);session.dispose();};},[session]);
 if(!panel)return null;
 const native=isTauri();const panelId=panel.id.slice(panel.extId.length+1);
 const src=native?{src:panelUrl(panel.extId,panelId,token)}:{srcDoc:panelSrcdoc(panel.html,token)};
 return <aside className="panel sidebar" aria-label={panel.title}><h2 className="m-0 px-3 pt-3 text-[13px]">{panel.title}</h2>{navigated?<p role="alert" className="m-0 p-3 text-[12px]">{t('panels.extension.navigationBlocked')}</p>:<iframe key={token} ref={frame} onLoad={()=>session?.onLoad()} title={t('panels.extension.title',{title:panel.title})} sandbox="allow-scripts" {...src} className="min-h-0 w-full flex-1 border-0 bg-transparent"/>}</aside>;
}
