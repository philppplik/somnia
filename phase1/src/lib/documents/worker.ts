/// <reference lib="webworker" />
import init,{DocSession} from '../../../documents/pkg/wordcraft_somnia_worker.js';
import type {DocumentsRequest,DocumentsResponse} from './protocol';
import {DocumentsCore} from './core';
const scope=self as unknown as DedicatedWorkerGlobalScope;
const core=new DocumentsCore(DocSession);
let ready:Promise<unknown>|undefined;
scope.onmessage=async({data}:MessageEvent<DocumentsRequest>)=>{
 const send=(message:DocumentsResponse,transfer:Transferable[]=[])=>scope.postMessage(message,transfer);
 try{
  if(data.kind==='init'){const start=performance.now();ready??=init({module_or_path:data.wasmUrl});await ready;send({id:data.id,ok:true,kind:'ready',initMs:performance.now()-start});return;}
  if(!ready)throw new Error('Documents engine is not initialised.');
  await ready;
  const {res,transfer}=core.handle(data);send(res,transfer);
 }catch(error){send({id:data.id,ok:false,error:error instanceof Error?error.message:String(error)});}
};
