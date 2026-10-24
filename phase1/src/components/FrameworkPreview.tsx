import {useEffect,useSyncExternalStore,useState} from 'react';
import {frameworkSession} from '../lib/frameworks/runtime';
import {frameworkSourceLocation} from '../lib/frameworks/previewSecurity';
import {jumpToLine,useAppStore,patchState,getState} from '../store/appStore';
import {useT} from '../lib/useT';
import {Button} from './ui/button';
import {getPreviewResourceSource} from '../lib/previewResourceSource';
import {isTauri} from '@tauri-apps/api/core';
/** Framework process output lives in Problems. Native preview uses a separate, capability-free window. */
export function FrameworkPreview(){
 const {t}=useT();const app=useAppStore();const state=useSyncExternalStore(frameworkSession.subscribe,frameworkSession.getSnapshot,frameworkSession.getSnapshot);const source=getPreviewResourceSource();const [opening,setOpening]=useState(false);const [openError,setOpenError]=useState(false);
 useEffect(()=>{if(!isTauri())return;let off:(()=>void)|undefined,cancelled=false;void import('@tauri-apps/api/event').then(async({listen})=>{const unsubscribe=await listen<{projectId:string;file:string;line:number;col:number}>('somnia://framework-source',event=>{const data=event.payload;const current=getPreviewResourceSource();if(!current||data.projectId!==current.projectId)return;const location=frameworkSourceLocation(`${data.file}:${data.line}`);if(location&&Object.hasOwn(getState().files,location.file))jumpToLine(location.file,location.line,Number.isInteger(data.col)&&data.col>0?data.col:1);});if(cancelled)unsubscribe();else off=unsubscribe;});return()=>{cancelled=true;off?.();};},[]);
 useEffect(()=>{if(state.state!=='running')return;const timer=setInterval(()=>{void frameworkSession.refresh().catch(()=>{});},2000);return()=>clearInterval(timer);},[state.state]);
 const open=async()=>{if(!state.handle)return;setOpening(true);setOpenError(false);try{await (await import('../lib/frameworks/runner')).openFrameworkPreview(state.handle.id);}catch{setOpenError(true);}finally{setOpening(false);}};
 return <section data-testid="framework-preview" className="canvas-stage flex min-h-0 flex-col" aria-label={t('frameworks.preview')}>
  <header className="flex items-center gap-2 border-b border-subtle px-3 py-2 text-[12px]"><span>{t('frameworks.preview')}</span><span className="grow"/><Button disabled={!source||['installing','starting'].includes(state.state)} onClick={()=>source&&void frameworkSession.start(source.projectId,true)}>{t(state.state==='running'?'frameworks.restart':'frameworks.runPreview')}</Button>{state.state==='running'&&<Button onClick={()=>void frameworkSession.stop()}>{t('frameworks.stop')}</Button>}<Button onClick={()=>patchState({livePreview:false,viewMode:'code'})}>{t('rest.livePreview.close')}</Button></header>
  <div className="grid flex-1 place-items-center p-6"><div className="max-w-[400px] text-center"><p role="status" className="text-[13px] text-ink-2">{t(openError?'frameworks.previewFailed':state.errorKey??(state.state==='running'?'frameworks.previewWindow':state.state==='idle'?'frameworks.previewIdle':state.state==='installing'?'frameworks.installing':'frameworks.starting'))}</p>
  {state.state==='running'&&<><Button variant="primary" disabled={opening||!isTauri()} onClick={()=>void open()}>{t('frameworks.openPreview')}</Button><p className="mt-3 text-[11px] text-ink-3">{t('frameworks.sourceHint')}</p></>}
  {(state.state==='failed'||openError)&&<Button onClick={()=>patchState({problemsOpen:true})}>{t('frameworks.openLog')}</Button>}
  {!isTauri()&&<p className="text-[11px] text-ink-3">{t('frameworks.desktopPreview')}</p>}
  </div></div>
  <span className="sr-only">{app.activeFile}</span>
 </section>;
}
