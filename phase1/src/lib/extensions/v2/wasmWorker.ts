/// <reference lib="webworker" />
import {validateWasm} from './wasm';
import {parseStrictJson,validateEnvelope,MAX_RPC_BYTES,type RpcEnvelope} from './rpc';
const scope=self as unknown as DedicatedWorkerGlobalScope;
let generation=0,instance:WebAssembly.Instance|undefined;let initialized=false;const emitted:RpcEnvelope[]=[];
const bounds=(ptr:number,len:number)=>{const memory=instance?.exports.memory;if(!(memory instanceof WebAssembly.Memory)||!Number.isInteger(ptr)||!Number.isInteger(len)||ptr<0||len<0||len>MAX_RPC_BYTES||ptr+len>memory.buffer.byteLength)throw Error('Invalid Wasm pointer.');return new Uint8Array(memory.buffer,ptr,len);};
const flush=()=>{for(const frame of emitted.splice(0))scope.postMessage(frame);};
scope.onmessage=async event=>{
 try {
  const message=event.data;
  if(!initialized){
   if(message?.type!=='load'||!(message.bytes instanceof Uint8Array)||!Number.isSafeInteger(message.generation)||message.generation<1)throw Error('Invalid bootstrap.');
   generation=message.generation;validateWasm(message.bytes);
   instance=await WebAssembly.instantiate(await WebAssembly.compile(message.bytes),{somnia:{emit:(ptr:number,len:number)=>{
    try{if(emitted.length>=32)return 0;const text=new TextDecoder('utf-8',{fatal:true}).decode(bounds(ptr,len));emitted.push(validateEnvelope(parseStrictJson(text),generation));return 1;}catch{return 0;}
   }}});
   const init=instance.exports.init as ()=>number;if(init()!==0)throw Error('Guest init failed.');initialized=true;flush();scope.postMessage({type:'loaded'});return;
  }
  if(message?.type!=='dispatch'||!Number.isSafeInteger(message.turnId))throw Error('Invalid host dispatch.');
  const frame=validateEnvelope(message.frame,generation);const bytes=new TextEncoder().encode(JSON.stringify(frame));
  const alloc=instance!.exports.alloc as (n:number)=>number,dealloc=instance!.exports.dealloc as (p:number,n:number)=>void,dispatch=instance!.exports.dispatch as (p:number,n:number)=>number;
  const ptr=alloc(bytes.length);try{bounds(ptr,bytes.length).set(bytes);if(dispatch(ptr,bytes.length)!==0)throw Error('Guest dispatch failed.');}finally{dealloc(ptr,bytes.length);}flush();scope.postMessage({type:'turnComplete',turnId:message.turnId});
 }catch{scope.postMessage({type:'fatal'});scope.close();}
};
