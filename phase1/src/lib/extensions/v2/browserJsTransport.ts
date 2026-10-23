import {ExtensionError} from '../contracts/v2/api';
import type {RuntimeFactory,RuntimeTransport} from '../supervisor';

/**
 * Browser runtime factory for isolated JS guests: spawns the bundled jsWorker.ts
 * bootstrap and hands it the guest entry URL from a host-owned resolver. The resolver
 * decides which URL a package digest/entry maps to; manifest-supplied URLs never reach
 * the worker. The URL must stay a same-origin bundled module so the guest boundary
 * remains "code shipped with the app", never remote code.
 */
export type GuestEntryResolver=(digest:string,entry:string,signal:AbortSignal)=>Promise<string>;

/** Structural view of the worker so unit tests can inject a fake; the browser supplies a real Worker. */
export interface JsWorkerLike {
 postMessage(message:unknown):void;
 terminate():void;
 onmessage:((event:{data:unknown})=>void)|null;
 onerror:((event:unknown)=>void)|null;
 onmessageerror:((event:unknown)=>void)|null;
}
export type JsWorkerSpawner=()=>JsWorkerLike;

export function assertBundledGuestUrl(entryUrl:string,origin:string):void {
 let url:URL;
 try{url=new URL(entryUrl);}catch{throw new ExtensionError('E_INVALID_ARGUMENT','Guest entry URL is invalid.');}
 if(!origin||url.origin!==origin)throw new ExtensionError('E_PERMISSION_DENIED','Guest entry must be a same-origin bundled module.');
}

export function browserJsFactory(resolveEntry:GuestEntryResolver,options:{spawnWorker?:JsWorkerSpawner;origin?:string}={}):RuntimeFactory {
 return async(bootstrap,signal)=>{
  if(bootstrap.runtime.type!=='js')throw new ExtensionError('E_INCOMPATIBLE_API','This transport only runs isolated JS guests.');
  const entryUrl=await resolveEntry(bootstrap.digest,bootstrap.runtime.entry??'',signal);
  if(signal.aborted)throw new ExtensionError('E_CANCELLED','Extension startup cancelled.');
  assertBundledGuestUrl(entryUrl,options.origin??globalThis.location?.origin??'');
  const worker=options.spawnWorker?options.spawnWorker():(new Worker(new URL('./jsWorker.ts',import.meta.url),{type:'module'}) as unknown as JsWorkerLike);
  if(signal.aborted){worker.terminate();throw new ExtensionError('E_CANCELLED','Extension startup cancelled.');}
  const transport:RuntimeTransport={
   send(frame){worker.postMessage(frame);},
   terminate(){worker.terminate();},
   onFrame:null,
   onError:null,
  };
  worker.onmessage=event=>{
   const data=event.data;
   if(data&&typeof data==='object'&&(data as {type?:unknown}).type==='fatal'){
    transport.onError?.(new ExtensionError('E_EXTENSION_FAULTED',typeof (data as {message?:unknown}).message==='string'?(data as {message:string}).message:'Guest runtime failed.'));
    return;
   }
   transport.onFrame?.(data);
  };
  worker.onerror=()=>transport.onError?.(new ExtensionError('E_EXTENSION_FAULTED','Guest runtime failed.'));
  worker.onmessageerror=()=>transport.onError?.(new ExtensionError('E_EXTENSION_FAULTED','Guest message could not be decoded.'));
  worker.postMessage({type:'load',entryUrl,generation:bootstrap.generation});
  return transport;
 };
}
