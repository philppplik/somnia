/// <reference lib="webworker" />
import {createSomniaSdk} from './sdk';
import {validateEnvelope,type RpcEnvelope} from './rpc';

/**
 * Trusted bootstrap for isolated JS guests (the js counterpart of wasmWorker.ts).
 * Ships inside the app bundle; the guest module does NOT. The bootstrap owns the
 * protocol handshake (bootstrap -> hello, activate -> import guest -> ready) and the
 * frame bridge; the guest only ever sees the createSomniaSdk surface.
 *
 * Trust model: the host-side resolver (browserJsTransport) supplies the entry URL and
 * the bootstrap re-checks it is a same-origin module before importing. Guest faults end
 * the session with a fatal notice, mirroring the wasm transport.
 */
const scope=self as unknown as DedicatedWorkerGlobalScope;
let generation=0;
let entryUrl='';
let sdk:ReturnType<typeof createSomniaSdk>|null=null;
let receive:((frame:unknown)=>void)|null=null;
const post=(frame:RpcEnvelope)=>scope.postMessage(frame);
const fatal=(message:string)=>{
 try{sdk?.dispose();}catch{/* already ending */}
 sdk=null;receive=null;
 try{scope.postMessage({type:'fatal',message:message.slice(0,200)});}catch{/* port gone */}
 scope.close();
};
scope.onmessage=async event=>{
 const message=event.data;
 if(message&&typeof message==='object'&&(message as {type?:unknown}).type==='load'){
  const m=message as {entryUrl?:unknown;generation?:unknown};
  if(generation!==0||typeof m.entryUrl!=='string'||!Number.isSafeInteger(m.generation)||(m.generation as number)<1){fatal('Invalid bootstrap.');return;}
  let url:URL;
  try{url=new URL(m.entryUrl);}catch{fatal('Invalid guest entry.');return;}
  if(url.origin!==scope.location.origin){fatal('Guest entry must be a same-origin bundled module.');return;}
  entryUrl=m.entryUrl;generation=m.generation as number;return;
 }
 if(generation===0)return;
 let frame:RpcEnvelope;
 try{frame=validateEnvelope(message,generation);}catch{return;}
 if('method' in frame&&frame.method==='bootstrap'&&!('id' in frame)){
  post({protocolVersion:1,generation,method:'hello',params:{protocolVersions:[1],runtime:'js'}});
  return;
 }
 if('method' in frame&&frame.method==='activate'&&!('id' in frame)){
  try{
   if(sdk)throw Error('Duplicate activation.');
   const module=await import(/* @vite-ignore */ entryUrl) as {activate?:unknown};
   if(typeof module.activate!=='function')throw Error('Guest module does not export activate().');
   sdk=createSomniaSdk({
    send:post,
    receive:callback=>{receive=callback;return {dispose(){if(receive===callback)receive=null;}};},
   },generation);
   await (module.activate as (somnia:unknown)=>unknown)(sdk.somnia);
   post({protocolVersion:1,generation,method:'ready',params:{}});
  }catch(error){fatal(error instanceof Error?error.message:'Guest activation failed.');}
  return;
 }
 // Command, event, deactivate and reply frames belong to the guest SDK session.
 if(receive)receive(message);
};
