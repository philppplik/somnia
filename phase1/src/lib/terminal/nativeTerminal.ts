// Native boundary for the inline terminal. Thin wrappers over the terminal_* Tauri commands
// plus the two session events. All decode/encode lives here; the store and views see bytes.
import {isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {invokeCmd} from '../invokeCmd';

export const TERMINAL_OUTPUT_EVENT='somnia://terminal-output';
export const TERMINAL_EXIT_EVENT='somnia://terminal-exit';

export interface TerminalInfo{sessionId:string;shell:string;cwd:string;pid:number|null;alive:boolean;exitCode:number|null}
export interface TerminalSnapshot{info:TerminalInfo;dataBase64:string;droppedBytes:number}

export const terminalAvailable=()=>isTauri();

export function decodeBase64(data:string):Uint8Array{
 const bin=atob(data);const out=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
 return out;
}

export const terminalSpawn=(cwd:string|null,cols:number,rows:number)=>invokeCmd('terminal_spawn',{cwd,cols,rows});
export const terminalList=()=>invokeCmd('terminal_list');
export const terminalAttach=(sessionId:string)=>invokeCmd('terminal_attach',{sessionId});
export const terminalWrite=(sessionId:string,data:string)=>invokeCmd('terminal_write',{sessionId,data});
export const terminalResize=(sessionId:string,cols:number,rows:number)=>invokeCmd('terminal_resize',{sessionId,cols,rows});
export const terminalKill=(sessionId:string)=>invokeCmd('terminal_kill',{sessionId});

/** Subscribes to live PTY output. No-op unsubscribe outside the desktop app. */
export async function onTerminalOutput(handler:(sessionId:string,bytes:Uint8Array)=>void):Promise<()=>void>{
 if(!isTauri())return()=>{};
 return listen<{sessionId:string;dataBase64:string}>(TERMINAL_OUTPUT_EVENT,event=>{
  handler(event.payload.sessionId,decodeBase64(event.payload.dataBase64));
 });
}
export async function onTerminalExit(handler:(sessionId:string,exitCode:number|null)=>void):Promise<()=>void>{
 if(!isTauri())return()=>{};
 return listen<{sessionId:string;exitCode:number|null}>(TERMINAL_EXIT_EVENT,event=>{
  handler(event.payload.sessionId,event.payload.exitCode);
 });
}
