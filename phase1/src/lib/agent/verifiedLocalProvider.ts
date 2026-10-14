import {ProviderError} from './errors';
import {agentPrivacy} from './privacy';
import {requireLocalCapabilities} from './localCapabilities';
import type {AgentProvider,AgentProviderEvent,AgentProviderRequest} from './types';
import type {OllamaProvider} from './providers/ollama';
/** Verify each outgoing round, including tool results. A loopback endpoint alone is insufficient. */
export function verifiedLocalProvider(provider:OllamaProvider,numCtx?:number):AgentProvider {
 const checked=requireLocalCapabilities(provider,numCtx);
 return {id:provider.id,locality:provider.locality,async *stream(request:AgentProviderRequest){
  request.signal.throwIfAborted();
  const check=await provider.verifyLocalModel(request.model,request.signal);
  request.signal.throwIfAborted();
  if(!check.local)throw new ProviderError(check.reason==='model-not-found'?'model-not-found':check.reason==='unreachable'?'unreachable':'not-local','Native studio mode requires verified local Ollama weights.');
  const controller=new AbortController(),abort=()=>controller.abort(request.signal.reason);
  request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
  let gateSignal:AbortSignal|undefined,slot:AgentProviderEvent|undefined,finished=false,error:unknown,wake=()=>{},release=()=>{};
  const pending=agentPrivacy.run({provider:'ollama',endpoint:provider.baseUrl,processing:'local'},async signal=>{
   gateSignal=signal;
   for await(const event of checked.stream({...request,signal})){
    signal.throwIfAborted();
    await new Promise<void>(resolve=>{
     const released=()=>{signal.removeEventListener('abort',released);resolve();};
     release=released;signal.addEventListener('abort',released,{once:true});slot=event;wake();if(signal.aborted)released();
    });
    signal.throwIfAborted();
   }
  },controller.signal).catch(e=>{error=e;}).finally(()=>{finished=true;wake();});
  try{while(!finished||slot){if(!slot){await new Promise<void>(resolve=>{wake=resolve;});continue;}controller.signal.throwIfAborted();gateSignal?.throwIfAborted();const event=slot;slot=undefined;release();yield event;}if(error)throw error;}
  finally{controller.abort();release();await pending;request.signal.removeEventListener('abort',abort);}
 }};
}
