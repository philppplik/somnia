// Bottom-panel terminal tab: session tabs (interactive shells + read-only run streams),
// an xterm.js view per active session, and the empty state. PTY sessions live in the Rust
// host, so closing the panel (or this view) never kills a shell.
import {useEffect,useRef,useSyncExternalStore} from 'react';
import {useAppStore} from '../store/appStore';
import {useT} from '../lib/useT';
import {t as translate} from '../lib/i18n';
import {Plus,X,Terminal as TerminalIcon} from '../lib/icons';
import {terminalSessions} from '../lib/terminal/terminalSessions';
import type {TerminalSessionEntry} from '../lib/terminal/terminalSessions';
import * as native from '../lib/terminal/nativeTerminal';
import {frameworkSession} from '../lib/frameworks/runtime';
import {XtermHost,type XtermController} from './XtermHost';

function ShellSessionView({id,dark}:{id:string;dark:boolean}){
 const {t}=useT();
 const controller=useRef<XtermController|null>(null);
 useEffect(()=>{
  let disposed=false;
  const unsubs:(()=>void)[]=[];
  void native.terminalAttach(id).then(snapshot=>{
   if(disposed)return;
   const bytes=native.decodeBase64(snapshot.dataBase64);
   if(snapshot.droppedBytes>0)controller.current?.write(translate('terminal.truncated')+'\r\n');
   if(bytes.length)controller.current?.write(bytes);
   if(!snapshot.info.alive){
    const line=snapshot.info.exitCode===null?translate('terminal.exitedUnknown'):translate('terminal.exited',{code:snapshot.info.exitCode});
    controller.current?.write('\r\n'+line+'\r\n');
   }
  }).catch(()=>{});
  void native.onTerminalOutput((sessionId,bytes)=>{
   if(sessionId===id)controller.current?.write(bytes);
  }).then(u=>{if(disposed)u();else unsubs.push(u);});
  void native.onTerminalExit((sessionId,exitCode)=>{
   if(sessionId!==id)return;
   terminalSessions.handleExit(sessionId,exitCode);
   const line=exitCode===null?translate('terminal.exitedUnknown'):translate('terminal.exited',{code:exitCode});
   controller.current?.write('\r\n'+line+'\r\n');
  }).then(u=>{if(disposed)u();else unsubs.push(u);});
  return()=>{disposed=true;unsubs.forEach(u=>u());};
 },[id]);
 return <XtermHost
  dark={dark}
  ariaLabel={t('terminal.terminal')}
  register={c=>{controller.current=c;if(c)c.focus();}}
  onData={data=>{void native.terminalWrite(id,data).catch(()=>{});}}
  onResize={(cols,rows)=>{void native.terminalResize(id,cols,rows).catch(()=>{});}}
 />;
}

function RunStreamView({dark}:{dark:boolean}){
 const {t}=useT();
 const controller=useRef<XtermController|null>(null);
 const written=useRef(0);
 const fw=useSyncExternalStore(frameworkSession.subscribe,frameworkSession.getSnapshot,frameworkSession.getSnapshot);
 useEffect(()=>{
  const c=controller.current;
  if(!c)return;
  // A new run resets the log array; rewrite from scratch when it shrinks.
  if(fw.logs.length<written.current){c.clear();written.current=0;}
  for(const line of fw.logs.slice(written.current))c.write(line.line.replace(/\n/g,'')+'\r\n');
  written.current=fw.logs.length;
 },[fw.logs]);
 return <XtermHost
  dark={dark}
  readOnly
  ariaLabel={t('terminal.readOnlyStream')}
  register={c=>{controller.current=c;written.current=0;}}
 />;
}

export function TerminalPanel(){
 const {t}=useT();
 const app=useAppStore();
 const state=useSyncExternalStore(terminalSessions.subscribe,terminalSessions.getSnapshot,terminalSessions.getSnapshot);
 useEffect(()=>{void terminalSessions.reconnect().catch(()=>{});},[]);
 const active=state.entries.find(e=>e.id===state.activeId)??null;
 return <section className="terminal-panel flex h-[30vh] min-h-[160px] flex-col gap-2 bg-panel p-3" aria-label={t('terminal.terminal')} data-testid="terminal-panel">
  <div className="flex shrink-0 items-center gap-1" role="tablist" aria-label={t('terminal.sessions')}>
   {state.entries.map((entry:TerminalSessionEntry)=><button
    key={entry.id}
    role="tab"
    aria-selected={entry.id===state.activeId}
    data-testid={`terminal-session-${entry.id}`}
    className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ${entry.id===state.activeId?'bg-hover text-ink':'text-ink-3 hover:bg-hover'}`}
    onClick={()=>terminalSessions.select(entry.id)}
   >
    <TerminalIcon size={11}/>
    <span>{entry.titleKey?t(entry.titleKey):entry.title}</span>
    {entry.readOnly&&<span className="text-[9px] text-ink-3">({t('terminal.readOnly')})</span>}
    {!entry.alive&&<span className="text-[9px] text-ink-3">({t('terminal.done')})</span>}
    {entry.unread&&<span aria-hidden className="size-1.5 rounded-full bg-accent"/>}
    {entry.kind==='shell'&&<span
     role="button"
     aria-label={t('terminal.closeSession')}
     className="ml-0.5 rounded p-0.5 hover:bg-subtle"
     onClick={event=>{event.stopPropagation();void terminalSessions.kill(entry.id).catch(()=>{});}}
    ><X size={10}/></span>}
   </button>)}
   <span className="grow"/>
   <button
    className="flex items-center gap-1 rounded border border-subtle bg-transparent px-2 py-0.5 text-[11px] text-ink-2 hover:bg-hover disabled:opacity-40"
    disabled={!state.nativeAvailable}
    title={state.nativeAvailable?t('terminal.new'):t('terminal.desktopOnly')}
    data-testid="terminal-new"
    onClick={()=>{void terminalSessions.spawn().catch(()=>{});}}
   ><Plus size={11}/>{t('terminal.new')}</button>
  </div>
  {active?.kind==='shell'&&<ShellSessionView key={active.id} id={active.id} dark={app.theme==='dark'}/>}
  {active?.kind==='run'&&<RunStreamView key={active.id} dark={app.theme==='dark'}/>}
  {!active&&<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-ink-3" data-testid="terminal-empty">
   <TerminalIcon size={20}/>
   <p className="text-[11px]">{state.nativeAvailable?t('terminal.empty'):t('terminal.desktopOnly')}</p>
  </div>}
 </section>;
}
