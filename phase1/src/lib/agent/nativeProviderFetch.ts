import {invoke,isTauri} from '@tauri-apps/api/core';
import type {AuthProvider} from './providerAuth';
export class NativeProviderError extends Error {constructor(readonly locked:boolean){super(locked?'OS credential store is locked or key is missing.':'Native provider connection failed.');}}
export const NATIVE_KEY_MARKER='somnia-native-key';
export function nativeProviderFetch(provider:AuthProvider,candidateKey?:string):typeof fetch {
 return async(input,init)=>{
  if(!isTauri())throw Error('Native provider transport requires the desktop app.');
  const url=String(input),signal=init?.signal;
  signal?.throwIfAborted();let id:string|undefined;
  const cancel=()=>{if(id)void invoke('provider_http_cancel',{id}).catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  try{
   const result=await invoke<{id:string;status:number;headers:Record<string,string>}>('provider_http_start',{provider,url,method:init?.method??'GET',body:typeof init?.body==='string'?init.body:null,candidateKey:candidateKey??null});
   id=result.id;signal?.throwIfAborted();
   const body=new ReadableStream<Uint8Array>({async pull(controller){
    try{signal?.throwIfAborted();const bytes=await invoke<number[]|null>('provider_http_next',{id});signal?.throwIfAborted();if(bytes===null){signal?.removeEventListener('abort',cancel);controller.close();}else controller.enqueue(new Uint8Array(bytes));}
    catch{cancel();signal?.removeEventListener('abort',cancel);controller.error(new Error('Provider stream interrupted.'));}
   },cancel(){cancel();signal?.removeEventListener('abort',cancel);}});
   return new Response(body,{status:result.status,headers:result.headers});
  }catch(error){cancel();signal?.removeEventListener('abort',cancel);if(signal?.aborted)throw signal.reason;throw new NativeProviderError(typeof error==='string'&&/credential|key is missing/.test(error));}
 };
}
