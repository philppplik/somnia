import {invoke} from '@tauri-apps/api/core';
import type {WorkerLike} from './runtime';
/** Frontend side of the Rust somnia-ext scheme (src-tauri/src/ext_scheme.rs, docs/extensions/09-native-scheme.md). */
export interface DocReply{url:string;session:string}
export interface NativePorts{
 invoke<T>(cmd:string,args:Record<string,unknown>):Promise<T>;
 /** Mount a hidden, NON-sandboxed relay frame (the trusted relay must be same-origin with the worker it starts). */
 mountRelay(url:string,onMessage:(source:'relay',data:unknown)=>void,session:string):{post(m:unknown):void;remove():void};
}
const realPorts=():NativePorts=>({
 invoke:(cmd,args)=>invoke(cmd,args),
 mountRelay:(url,onMessage,session)=>{
  const f=document.createElement('iframe');f.setAttribute('aria-hidden','true');f.tabIndex=-1;f.style.cssText='position:fixed;width:0;height:0;border:0;visibility:hidden';
  let ready=false;const q:unknown[]=[];
  const on=(e:MessageEvent)=>{if(e.source!==f.contentWindow)return;const d=e.data as {session?:unknown}|null;if(!d||d.session!==session)return;onMessage('relay',d);};
  window.addEventListener('message',on);f.onload=()=>{ready=true;q.splice(0).forEach(m=>f.contentWindow?.postMessage(m,'*'));};
  f.src=url;document.body.appendChild(f);
  return{post:m=>{if(ready)f.contentWindow?.postMessage(m,'*');else q.push(m);},remove:()=>{window.removeEventListener('message',on);f.remove();}};
 }
});
/** Register a full panel document with the Rust core; returns the single-use URL. The caller appends `#<token>`. */
export const openPanelDocument=(extId:string,panelId:string,document:string,ports:Pick<NativePorts,'invoke'>=realPorts())=>ports.invoke<DocReply>('ext_panel_open',{extId,panelId,document});
/** Revoke one panel (panelId given) or everything of an extension. Errors are ignored: revocation is best effort and the nonce is single-use anyway. */
export const closeExtDocuments=(extId:string,panelId?:string,ports:Pick<NativePorts,'invoke'>=realPorts())=>{void ports.invoke('ext_close',{extId,panelId:panelId??null}).catch(()=>{});};
/** Worker via the trusted same-origin relay. Messages from the relay arrive as {session,data} (unwrapped here) or {session,error} (surfaced through onerror). Messages are queued until the relay frame is up. */
export function relayWorker(extId:string,ports:NativePorts=realPorts()):WorkerLike{
 let frame:{post(m:unknown):void;remove():void}|null=null;let dead=false;const q:unknown[]=[];
 const w:WorkerLike={onmessage:null,onerror:null,
  postMessage(m){if(dead)return;frame?frame.post(m):q.push(m);},
  terminate(){dead=true;frame?.remove();frame=null;closeExtDocuments(extId,undefined,ports);}};
 ports.invoke<DocReply>('ext_worker_open',{extId}).then(r=>{
  if(dead)return;
  frame=ports.mountRelay(r.url,(_s,raw)=>{const d=raw as {data?:unknown;error?:unknown};if(typeof d.error==='string'){w.onerror?.({message:d.error});return;}w.onmessage?.({data:d.data});},r.session);
  q.splice(0).forEach(m=>frame!.post(m));
 }).catch(e=>w.onerror?.({message:String(e&&(e as Error).message||e)}));
 return w;
}
