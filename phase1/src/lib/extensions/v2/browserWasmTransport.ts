import type {RuntimeFactory,RuntimeTransport} from '../supervisor';
import {ExtensionError} from '../contracts/v2/api';
import {validateWasm} from './wasm';
import {validateEnvelope,type RpcEnvelope} from './rpc';
/** The resolver checks immutable package digest and returns COPIED verified inventory bytes, not URLs or OS paths. */
export function browserWasmFactory(resolveEntry:(digest:string,entry:string,signal:AbortSignal)=>Promise<Uint8Array>):RuntimeFactory {
 return async(bootstrap,signal)=>{
  if(bootstrap.runtime.type!=='wasm'||bootstrap.runtime.abi!=='somnia-json-1'||!bootstrap.runtime.entry)throw new ExtensionError('E_INCOMPATIBLE_API','Only isolated bare Wasm is available in this browser.');
  const bytes=await resolveEntry(bootstrap.digest,bootstrap.runtime.entry,signal);validateWasm(bytes);if(signal.aborted)throw new ExtensionError('E_CANCELLED','Runtime launch cancelled.');
  // This is trusted HOST bootstrap code, never an extension-supplied module URL. Guest has only somnia.emit.
  const worker=new Worker(new URL('./wasmWorker.ts',import.meta.url),{type:'module',name:`somnia-wasm-${bootstrap.extensionId}`});
  let turnId=0,current=0,stopped=false,loaded=false,timer:ReturnType<typeof setTimeout>|undefined;const queue:RpcEnvelope[]=[];
  const stop=()=>{if(stopped)return;stopped=true;if(timer)clearTimeout(timer);queue.length=0;worker.terminate();};
  const fail=()=>{stop();transport.onError?.(new ExtensionError('E_TIMEOUT','Wasm turn exceeded its deadline.'));};
  const pump=()=>{if(stopped||!loaded||current||!queue.length)return;const frame=queue.shift()!;current=++turnId;
   const budget='method'in frame&&['bootstrap','activate','command'].includes(frame.method)?5000:100;
   timer=setTimeout(fail,budget);worker.postMessage({type:'dispatch',turnId:current,frame});};
  const transport:RuntimeTransport={onFrame:null,onError:null,send:frame=>{if(stopped)throw new ExtensionError('E_CANCELLED','Wasm worker stopped.');validateEnvelope(frame,bootstrap.generation);if(queue.length>=200)throw new ExtensionError('E_RESOURCE_LIMIT','Wasm message queue exceeded budget.');queue.push(frame);pump();},terminate:stop};
  worker.onmessage=e=>{if(stopped)return;if(e.data?.type==='fatal'){fail();return;}
   if(e.data?.type==='loaded'){loaded=true;pump();return;}
   if(e.data?.type==='turnComplete'){if(e.data.turnId!==current){fail();return;}if(timer)clearTimeout(timer);current=0;pump();return;}transport.onFrame?.(e.data);};
  worker.onerror=fail;worker.onmessageerror=fail;signal.addEventListener('abort',stop,{once:true});
  // Register handlers before load; no guest reply can race the supervisor in the same JS task.
  worker.postMessage({type:'load',generation:bootstrap.generation,bytes:bytes.slice()});return transport;
 };
}
