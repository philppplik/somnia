/** Source of the extension worker bootstrap, the single source of truth. Desktop (Tauri): the Rust side must serve exactly this text as the response of somnia-ext://worker/<ext-id> with its own CSP (script-src 'unsafe-eval'; connect-src 'none'). Web/dev: runtime.ts creates a blob worker from it under the page CSP. Network and storage globals are removed before extension code runs (defence in depth; the response CSP is the boundary on desktop). */
export const WORKER_SOURCE=`
'use strict';
for(const k of ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','indexedDB','caches','BroadcastChannel','SharedWorker','Worker','WebTransport','navigator']){try{Object.defineProperty(self,k,{value:undefined,configurable:false,writable:false});}catch(e){}}
const post=m=>self.postMessage(m);let n=0;const pending=new Map();const handlers=new Map();let suspendFn=null,resumeFn=null;
const call=(method,args)=>new Promise((resolve,reject)=>{const id=++n;pending.set(id,{resolve,reject});post({type:'api.call',requestId:id,method,args});});
const somnia=Object.freeze({
 commands:Object.freeze({register:(id,fn)=>{if(typeof fn!=='function')throw new TypeError('handler must be a function');handlers.set(id,fn);return call('commands.register',[id]);}}),
 project:Object.freeze({listFiles:()=>call('project.listFiles',[]),readFile:p=>call('project.readFile',[p]),readOfferFile:t=>call('project.readOfferFile',[t])}),
 selection:Object.freeze({get:()=>call('selection.get',[])}),
 editor:Object.freeze({applyOperations:ops=>call('editor.applyOperations',[ops])}),
 storage:Object.freeze({get:k=>call('storage.get',[k]),set:(k,v)=>call('storage.set',[k,v])}),
 lifecycle:Object.freeze({onSuspend:fn=>{if(typeof fn!=='function')throw new TypeError('onSuspend must be a function');suspendFn=fn;},onResume:fn=>{if(typeof fn!=='function')throw new TypeError('onResume must be a function');resumeFn=fn;}}),
 ui:Object.freeze({notify:t=>call('ui.notify',[t])})});
self.onmessage=async e=>{const m=e.data||{};
 if(m.type==='api.result'){const p=pending.get(m.requestId);if(!p)return;pending.delete(m.requestId);m.ok?p.resolve(m.value):p.reject(new Error(m.error));return;}
 if(m.type==='activate'){try{const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;await new AsyncFunction('somnia',m.code)(somnia);post({type:'activated',protocol:2});}catch(err){post({type:'log',level:'error',text:String(err&&err.message||err)});post({type:'activated',error:true});}return;}
 if(m.type==='suspend'){try{const state=suspendFn?await suspendFn():null;post({type:'suspend.done',requestId:m.requestId,ok:true,state,noHandler:!suspendFn});}catch(err){post({type:'suspend.done',requestId:m.requestId,ok:false,error:String(err&&err.message||err)});}return;}
 if(m.type==='resume'){try{if(resumeFn)await resumeFn(m.state);post({type:'resume.done',requestId:m.requestId,ok:true});}catch(err){post({type:'resume.done',requestId:m.requestId,ok:false,error:String(err&&err.message||err)});}return;}
 if(m.type==='command.run'){const fn=handlers.get(m.id);try{if(!fn)throw new Error('No handler registered for '+m.id);await fn(m.args);post({type:'command.done',requestId:m.requestId});}catch(err){post({type:'command.done',requestId:m.requestId,error:String(err&&err.message||err)});}}
};`;
