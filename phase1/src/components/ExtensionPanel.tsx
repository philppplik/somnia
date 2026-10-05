import {useT} from '../lib/useT';
import {useEffect,useRef} from 'react';
import {callApi} from '../lib/extensions/api';
import {loadActiveExtensions} from '../lib/extensions/registry';
import {panelSrcdoc} from '../lib/extensions/panelHtml';
import {getState,patchState,useAppStore} from '../store/appStore';
/** Sidebar or inspector body contributed by an extension. Runs in a sandboxed iframe without same-origin access and without network. */
export function ExtensionPanel({id}:{id:string}){
 const {t}=useT();
 const panel=useAppStore().extensionPanels.find(p=>p.id===id);const frame=useRef<HTMLIFrameElement>(null);
 useEffect(()=>{if(!panel)return;const on=(e:MessageEvent)=>{if(e.source!==frame.current?.contentWindow)return;const m=e.data;if(!m||m.type!=='api.call')return;
  const ext=loadActiveExtensions().find(x=>x.id===panel.extId);const reply=(extra:object)=>frame.current?.contentWindow?.postMessage({type:'api.result',requestId:m.requestId,...extra},'*');
  if(!ext){reply({ok:false,error:'Extension is not active.'});return;}
  try{const value=callApi(ext,String(m.method),Array.isArray(m.args)?m.args:[],{files:()=>getState().files as Record<string,string>,selection:()=>{const sel=getState().selectedElementId;let hit:{id:string;tag:string}|null=null;const walk=(ns:{id:string;tag:string;children:any[]}[])=>ns.forEach(n=>{if(n.id===sel)hit={id:n.id,tag:n.tag};walk(n.children);});walk(getState().nodes as never);return hit;},notify:t=>patchState({notice:t}),registerHandler:()=>{},storage:{get:k=>localStorage.getItem(`somnia.ext.${ext.id}.${k}`),set:(k,v)=>localStorage.setItem(`somnia.ext.${ext.id}.${k}`,v)}});reply({ok:true,value});}
  catch(error){reply({ok:false,error:error instanceof Error?error.message:String(error)});}};
  window.addEventListener('message',on);return()=>window.removeEventListener('message',on);},[panel]);
 if(!panel)return null;
 return <aside className="panel sidebar" aria-label={panel.title}><h2 className="m-0 px-3 pt-3 text-[13px]">{panel.title}</h2><iframe ref={frame} title={t('panels.extension.title',{title:panel.title})} sandbox="allow-scripts" srcDoc={panelSrcdoc(panel.html)} className="min-h-0 w-full flex-1 border-0 bg-transparent"/></aside>;
}
