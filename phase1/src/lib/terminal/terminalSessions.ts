/**
 * Session store for the bottom-panel terminal. Two kinds of entries:
 * - `shell`: interactive PTY sessions owned by the Rust host (see src-tauri/src/terminal.rs).
 * - `run`: read-only streams of background processes (npm install, dev server, builds),
 *   mirrored from the framework runner so installs are watchable without a console window.
 */
import {frameworkSession} from '../frameworks/runtime';
import type {FrameworkSession} from '../frameworks/session';
import * as native from './nativeTerminal';
import type {TerminalInfo} from './nativeTerminal';

export interface TerminalSessionEntry{
 id:string;
 kind:'shell'|'run';
 /** Literal title (shell name). */
 title:string;
 /** Locale key; wins over title when set (run streams). */
 titleKey?:string;
 alive:boolean;
 readOnly:boolean;
 exitCode:number|null;
 /** Set when live output arrived while another session was selected. */
 unread:boolean;
}
export interface TerminalSessionsState{
 entries:readonly TerminalSessionEntry[];
 activeId:string|null;
 nativeAvailable:boolean;
}

/** Injection seam for tests and the web build (no PTY without the desktop host). */
export interface TerminalNativePort{
 spawn(cwd:string|null,cols:number,rows:number):Promise<TerminalInfo>;
 list():Promise<TerminalInfo[]>;
 kill(sessionId:string):Promise<void>;
}
const defaultPort:TerminalNativePort={
 spawn:(cwd,cols,rows)=>native.terminalSpawn(cwd,cols,rows),
 list:()=>native.terminalList(),
 kill:async id=>{await native.terminalKill(id);},
};

interface Store<Snapshot>{getSnapshot():Snapshot;subscribe(fn:()=>void):()=>void}

export interface TerminalSessionsStore extends Store<TerminalSessionsState>{
 spawn(cwd?:string|null,cols?:number,rows?:number):Promise<string|null>;
 kill(id:string):Promise<void>;
 select(id:string|null):void;
 markUnread(id:string):void;
 /** Reflects native exit events. */
 handleExit(id:string,exitCode:number|null):void;
 /** Reconnect after a reload: adopt sessions that outlived the renderer. */
 reconnect():Promise<void>;
}

export const RUN_PREFIX='run:';
export function runEntry(fw:FrameworkSession,activeId:string|null):TerminalSessionEntry|null{
 const handle=fw.handle;
 if(!handle&&!fw.logs.length)return null;
 const id=handle?RUN_PREFIX+handle.id:RUN_PREFIX+'last';
 const kind=handle?.kind;
 const titleKey=kind==='install'?'terminal.run.install':kind==='build'?'terminal.run.build':'terminal.run.dev';
 const alive=fw.state==='installing'||fw.state==='starting'||fw.state==='running';
 return {id,kind:'run',title:'',titleKey,alive,readOnly:true,exitCode:handle?.exitCode??null,unread:id!==activeId&&alive};
}

export function createTerminalSessionsStore(port:TerminalNativePort=defaultPort,framework:Store<FrameworkSession>=frameworkSession,options:{nativeAvailable?:boolean}={}):TerminalSessionsStore{
 let state:TerminalSessionsState={entries:[],activeId:null,nativeAvailable:options.nativeAvailable??native.terminalAvailable()};
 const listeners=new Set<()=>void>();
 const set=(patch:Partial<TerminalSessionsState>)=>{state={...state,...patch};listeners.forEach(fn=>fn());};
 const merge=()=>{
  const shells=state.entries.filter(e=>e.kind==='shell');
  const run=runEntry(framework.getSnapshot(),state.activeId);
  const entries=run?[run,...shells]:shells;
  const activeId=state.activeId&&entries.some(e=>e.id===state.activeId)?state.activeId:(entries[0]?.id??null);
  if(entries!==state.entries||activeId!==state.activeId)set({entries,activeId});
 };
 framework.subscribe(merge);
 merge();
 return {
  getSnapshot:()=>state,
  subscribe(fn){listeners.add(fn);return()=>{listeners.delete(fn);};},
  async spawn(cwd=null,cols=80,rows=24){
   if(!state.nativeAvailable)return null;
   const info=await port.spawn(cwd,cols,rows);
   const entry:TerminalSessionEntry={id:info.sessionId,kind:'shell',title:info.shell,alive:true,readOnly:false,exitCode:null,unread:false};
   set({entries:[...state.entries,entry],activeId:entry.id});
   return entry.id;
  },
  async kill(id){
   const entry=state.entries.find(e=>e.id===id);
   if(!entry)return;
   if(entry.kind==='shell')await port.kill(id);
   const entries=state.entries.filter(e=>e.id!==id);
   set({entries,activeId:state.activeId===id?(entries[0]?.id??null):state.activeId});
  },
  select(id){
   set({activeId:id,entries:state.entries.map(e=>e.id===id?{...e,unread:false}:e)});
  },
  markUnread(id){
   if(state.activeId===id)return;
   const entry=state.entries.find(e=>e.id===id);
   if(!entry||entry.unread)return;
   set({entries:state.entries.map(e=>e.id===id?{...e,unread:true}:e)});
  },
  handleExit(id,exitCode){
   set({entries:state.entries.map(e=>e.id===id?{...e,alive:false,exitCode}:e)});
  },
  async reconnect(){
   if(!state.nativeAvailable)return;
   const infos=await port.list();
   if(!infos.length)return;
   const known=new Set(state.entries.map(e=>e.id));
   const adopted:TerminalSessionEntry[]=infos.filter(i=>!known.has(i.sessionId)).map(i=>({id:i.sessionId,kind:'shell',title:i.shell,alive:i.alive,readOnly:false,exitCode:i.exitCode,unread:false}));
   if(adopted.length)set({entries:[...state.entries,...adopted],activeId:state.activeId??adopted[0].id});
  },
 };
}

export const terminalSessions=createTerminalSessionsStore();
