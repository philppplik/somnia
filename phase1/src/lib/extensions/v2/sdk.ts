import {ExtensionError,type ApiMethod,type ApiMethods,type Disposable,type Json,type SomniaV2} from '../contracts/v2/api';
import {validateEnvelope,type RpcEnvelope} from './rpc';
export interface GuestChannel {send(frame:RpcEnvelope):void;receive(callback:(frame:unknown)=>void):Disposable}
/** Guest-local callback/subscription maps. No callbacks or authority-bearing objects cross the wire. */
export function createSomniaSdk(channel:GuestChannel,generation:number):{somnia:SomniaV2;dispose():void} {
 let seq=0,callbackSeq=0,closed=false;const handlers=new Map<number,(value:any)=>unknown>();const pending=new Map<number,{resolve(value:unknown):void;reject(e:Error):void;timer:ReturnType<typeof setTimeout>}>();
 const call=<M extends ApiMethod>(method:M,params:ApiMethods[M]['params']):Promise<ApiMethods[M]['result']>=>{
  if(closed)return Promise.reject(new ExtensionError('E_CANCELLED','SDK session ended.'));
  return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new ExtensionError('E_TIMEOUT','Host call timed out.'));},5000);pending.set(id,{resolve:resolve as (v:unknown)=>void,reject,timer});
   try{channel.send({protocolVersion:1,generation,id,method,params:params as Json});}catch{clearTimeout(timer);pending.delete(id);reject(new ExtensionError('E_CANCELLED','Host connection ended.'));}
  });
 };
 const listener=channel.receive(input=>{
  let frame:RpcEnvelope;try{frame=validateEnvelope(input,generation);}catch{dispose();return;}
  if('method'in frame){
   if(frame.method==='command'&&'id'in frame){const params=frame.params as {callbackId:number;args:Json};const handler=handlers.get(params.callbackId);if(!handler){channel.send({protocolVersion:1,generation,id:frame.id,error:{code:'E_HANDLER_MISSING',message:'Command handler missing.'}});return;}
    void Promise.resolve().then(()=>handler(params.args)).then(result=>{if(!closed)channel.send({protocolVersion:1,generation,id:frame.id,result:result===undefined?null:result as Json});},()=>{if(!closed)channel.send({protocolVersion:1,generation,id:frame.id,error:{code:'E_EXTENSION_FAULTED',message:'Command failed.'}});});
   }else if(frame.method==='event'&&!('id'in frame)){const params=frame.params as {callbackId:number;value:Json};try{handlers.get(params.callbackId)?.(params.value);}catch{/* local callback errors do not grant a new call */}}
   return;
  }
  const request=pending.get(frame.id);if(!request)return;clearTimeout(request.timer);pending.delete(frame.id);frame.error?request.reject(new ExtensionError(frame.error.code,frame.error.message)):request.resolve(frame.result);
 });
 const subscribe=async(method:'project.onDidChange'|'selection.onDidChange'|'panels.onMessage',callback:(v:any)=>void,panelId?:string):Promise<Disposable>=>{
  const callbackId=++callbackSeq;handlers.set(callbackId,callback);try{const subscriptionId=await call(method,(panelId?{callbackId,panelId}:{callbackId}) as never);let disposed=false;
   return {dispose(){if(disposed)return;disposed=true;handlers.delete(callbackId);if(!closed)void call('subscriptions.dispose',{subscriptionId}).catch(()=>{});}};
  }catch(error){handlers.delete(callbackId);throw error;}
 };
 const somnia:SomniaV2={
  commands:{async register(id,handler){const callbackId=++callbackSeq;handlers.set(callbackId,handler);try{await call('commands.register',{id,callbackId});return {dispose(){handlers.delete(callbackId);}};}catch(error){handlers.delete(callbackId);throw error;}}},
  project:{listFiles:()=>call('project.listFiles',{}),readFile:path=>call('project.readFile',{path}),onDidChange:callback=>subscribe('project.onDidChange',callback)},
  selection:{get:()=>call('selection.get',{}),onDidChange:callback=>subscribe('selection.onDidChange',callback)},
  editor:{applyOperations:request=>call('editor.applyOperations',request)},
  storage:{get:key=>call('storage.get',{key}),set:async(key,value)=>{await call('storage.set',{key,value});},delete:async key=>{await call('storage.delete',{key});}},
  ui:{notify:async text=>{await call('ui.notify',{text});}},
  panels:{onMessage:(panelId,callback)=>subscribe('panels.onMessage',callback,panelId),postMessage:async(panelId,message)=>{await call('panels.postMessage',{panelId,message});}},
 };
 function dispose(){if(closed)return;closed=true;listener.dispose();handlers.clear();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new ExtensionError('E_CANCELLED','SDK session ended.'));}pending.clear();}
 return {somnia,dispose};
}
