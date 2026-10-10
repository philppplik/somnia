import {useT} from '../lib/useT';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {callApi} from '../lib/extensions/api';
import {loadActiveExtensions} from '../lib/extensions/registry';
import {panelSrcdoc,panelDocument} from '../lib/extensions/panelHtml';
import {openPanelDocument,closeExtDocuments} from '../lib/extensions/nativeScheme';
import {PanelSession} from '../lib/extensions/panelSession';
import {getState,patchState,useAppStore} from '../store/appStore';
const newToken=()=>{const b=new Uint8Array(16);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');};
/** Sidebar or inspector body contributed by an extension. Native builds load it as its own document (somnia-ext://panel/<ext>/<panel>) inside a sandbox="allow-scripts" frame; web builds use srcdoc. API calls travel only over a per-session MessagePort (see panelSession.ts), so a frame that navigates loses all authority, and the host removes it on any second load. The app CSP frame-src refuses external frame navigation. */
export function ExtensionPanel({id}:{id:string}){
 const {t}=useT();
 const panel=useAppStore().extensionPanels.find(p=>p.id===id);const frame=useRef<HTMLIFrameElement>(null);
 const [navigated,setNavigated]=useState(false);
 const token=useMemo(newToken,[panel?.id,panel?.html]);
 const [session,setSession]=useState<PanelSession|null>(null);
 /** The session is created inside the effect (not memoised): React StrictMode runs effect cleanup once in dev, and a disposed session must never be reused. */
 const makeSession=useCallback(()=>{if(!panel)return null;
  return new PanelSession({token,onNavigated:()=>setNavigated(true),handle:(method,args)=>{
   const ext=loadActiveExtensions().find(x=>x.id===panel.extId);if(!ext)throw new Error('Extension is not active.');
   return callApi(ext,method,args,{files:()=>getState().files as Record<string,string>,selection:()=>{const sel=getState().selectedElementId;let hit:{id:string;tag:string}|null=null;const walk=(ns:{id:string;tag:string;children:any[]}[])=>ns.forEach(n=>{if(n.id===sel)hit={id:n.id,tag:n.tag};walk(n.children);});walk(getState().nodes as never);return hit;},notify:t=>patchState({notice:t}),registerHandler:()=>{},storage:{get:k=>localStorage.getItem(`somnia.ext.${ext.id}.${k}`),set:(k,v)=>localStorage.setItem(`somnia.ext.${ext.id}.${k}`,v)}});}});
 },[panel,token]);
 useEffect(()=>{setNavigated(false);},[panel?.id,panel?.html]);
 /** Native: register the full document with the Rust core (single-use URL), then mount the frame. Revoked on unmount or change. */
 const [nativeSrc,setNativeSrc]=useState<string|null>(null);const [nativeError,setNativeError]=useState(false);
 useEffect(()=>{if(!isTauri()||!panel)return;let live=true;setNativeSrc(null);setNativeError(false);const panelId=panel.id.slice(panel.extId.length+1);
  openPanelDocument(panel.extId,panelId,panelDocument(panel.html,null)).then(r=>{if(live)setNativeSrc(`${r.url}#${encodeURIComponent(token)}`);}).catch(()=>{if(live)setNativeError(true);});
  return()=>{live=false;closeExtDocuments(panel.extId,panelId);};},[panel?.id,panel?.html,panel?.extId,token]);
 useEffect(()=>{const sess=makeSession();setSession(sess);if(!sess)return;const on=(e:MessageEvent)=>{sess.onWindowMessage(e.source,frame.current?.contentWindow??null,e.data);};
  window.addEventListener('message',on);return()=>{window.removeEventListener('message',on);sess.dispose();};},[makeSession]);
 if(!panel)return null;
 const native=isTauri();
 const src=native?{src:nativeSrc??undefined}:{srcDoc:panelSrcdoc(panel.html,token)};
 return <aside data-extension-id={panel.extId} className="panel sidebar" aria-label={panel.title}><h2 className="m-0 px-3 pt-3 text-[13px]">{panel.title}</h2>{navigated||nativeError?<p role="alert" className="m-0 p-3 text-[12px]">{t('panels.extension.navigationBlocked')}</p>:(native&&!nativeSrc)||!session?null:<iframe key={token} ref={frame} onLoad={()=>session?.onLoad()} title={t('panels.extension.title',{title:panel.title})} sandbox="allow-scripts" {...src} className="min-h-0 w-full flex-1 border-0 bg-transparent"/>}</aside>;
}
