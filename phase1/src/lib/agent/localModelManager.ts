import {invoke} from '@tauri-apps/api/core';
import {LocalModelsRuntime} from './localModels';
import {agentSettingsSnapshot} from './settingsRuntime';
export type JobPhase='preparing'|'downloading'|'verifying'|'installing'|'reconciling'|'complete'|'failed'|'cancel-requested'|'interrupted';
export type CancelOutcome='cancelled'|'still-active'|'unknown';
export interface PullJob {model:string;phase:JobPhase;status?:string;layer?:{digest:string;completed?:number;total?:number};cancelOutcome?:CancelOutcome;error?:string}
interface PullTransport {start(model:string):Promise<string>;next(id:string):Promise<number[]|null>;cancel(id:string):Promise<CancelOutcome>;remove(model:string,digest:string):Promise<void>;launch():Promise<{launched:boolean;instruction?:string|null}>}
export interface Progress {status?:string;digest?:string;completed?:number;total?:number;error?:string}
export function registryModel(name:string):string {
 const model=name.trim();if(!model||model.length>200||!/^[a-zA-Z0-9_.:/-]+$/.test(model)||model.includes('..')||model.includes('://')||model.split('/').length>2||model.startsWith('/')||model.endsWith('/')||(model.match(/:/g)||[]).length>1||model.includes('/')&&/[.:]/.test(model.split('/')[0])||/(^|[:\-_/])cloud$/i.test(model))throw Error('Use an exact ollama.com library model name');return model.includes(':')?model:model+':latest';
}
/** Incremental bounded NDJSON parser. A full layer never implies model installation. */
export class PullParser {
 private buffer='';private decoder=new TextDecoder();
 feed(bytes:Uint8Array,final=false):Progress[]{
  this.buffer+=this.decoder.decode(bytes,{stream:!final});if(this.buffer.length>1_000_000)throw Error('Progress line too large');
  const lines=this.buffer.split('\n');this.buffer=final?'':lines.pop()!;return lines.filter(line=>line.trim()).map(line=>{
   let data:Progress;try{data=JSON.parse(line);}catch{throw Error('Malformed pull progress');}
   if(!data||typeof data!=='object'||Array.isArray(data)||data.status!==undefined&&typeof data.status!=='string'||data.error!==undefined&&typeof data.error!=='string'||data.digest!==undefined&&typeof data.digest!=='string')throw Error('Malformed pull progress');
   for(const n of [data.total,data.completed])if(n!==undefined&&(!Number.isSafeInteger(n)||n<0))throw Error('Invalid layer byte count');return data;
  });
 }
}
export function mutationAllowed(){const state=agentSettingsSnapshot();return state.ready&&!state.running&&!state.pendingReview&&!state.saving&&!state.authBusy;}
export class LocalModelManager {
 canMutate=()=>this.allowed();
 isBusy=()=>this.busy;
 private job:PullJob|null=null;private listeners=new Set<()=>void>();private id:string|null=null;private stopped=false;private busy=false;
 constructor(readonly runtime=new LocalModelsRuntime(),private transport:PullTransport={
  start:model=>invoke('local_models_pull',{baseUrl:runtime.baseUrl,model}),next:id=>invoke('local_models_pull_next',{id}),cancel:id=>invoke('local_models_pull_cancel',{id}),remove:(model,digest)=>invoke('local_models_delete',{baseUrl:runtime.baseUrl,model,expectedDigest:digest}),launch:()=>invoke('local_models_start')
 },private allowed=mutationAllowed){}
 snapshot=()=>this.job;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private update(patch:Partial<PullJob>){this.job={...this.job!,...patch};this.listeners.forEach(listener=>listener());}
 async launch(){if(!this.allowed())throw Error('Stop active AI work before starting Ollama');return this.transport.launch();}
 async pull(raw:string){
  const model=registryModel(raw);if(this.busy||!this.allowed())throw Error('Another operation or AI request is active');
  // Refresh before retry: never infer the result of a previous interrupted stream.
  this.busy=true;this.stopped=false;this.job={model,phase:'preparing'};this.update({});
  let success=false;
  try{
   const before=await this.runtime.snapshot();if(before.state!=='running'||before.inventoryError)throw Error('Refresh local runtime before retrying');
   if(this.stopped){this.update({phase:'interrupted',cancelOutcome:'unknown'});return;}
   if(!this.allowed())throw Error('AI request became active');
   this.id=await this.transport.start(model);
   if(this.stopped){const cancelOutcome=await this.transport.cancel(this.id).catch(()=> 'unknown' as const);this.update({phase:'interrupted',cancelOutcome});return;}
   this.update({phase:'downloading'});const parser=new PullParser();
   const handle=(event:Progress)=>{
    if(event.error)throw Error(classifyPullError(event.error));
    const phase=event.status==='success'?'reconciling':/verif/i.test(event.status??'')?'verifying':/writing|removing/i.test(event.status??'')?'installing':'downloading';
    if(event.status==='success')success=true;
    this.update({phase,status:event.status, ...(event.digest?{layer:{digest:event.digest,total:event.total,completed:event.completed}}:{})});
   };
   for(;;){const bytes=await this.transport.next(this.id);if(this.stopped)break;
    for(const event of parser.feed(new Uint8Array(bytes??[]),bytes===null))handle(event);
    if(bytes===null||success)break;
   }
   if(this.stopped){this.update({phase:'interrupted'});return;}
   this.update({phase:'reconciling'});
   const current=await this.runtime.snapshot();const exact=model.includes(':')?model:model+':latest';
   const present=!current.inventoryError&&current.models.some(m=>m.id===model||m.id===exact);
   const verified=success&&present&&await this.runtime.verify(exact);
   if(this.stopped){this.update({phase:'interrupted'});return;}
   if(verified)this.update({phase:'complete',layer:undefined});
   else this.update({phase:'interrupted',error:'Installation not confirmed. Refresh before retrying.'});
  }catch(error){if(!this.stopped)this.update({phase:success?'reconciling':'failed',error:error instanceof Error?error.message:'Operation failed'});}
  finally{if(this.id)await this.transport.cancel(this.id).catch(()=>{});this.id=null;this.busy=false;this.listeners.forEach(listener=>listener());}
 }
 async cancel(){
  if(!this.busy)return;this.stopped=true;this.update({phase:'cancel-requested'});
  const cancelOutcome=this.id?await this.transport.cancel(this.id).catch(()=> 'unknown' as const):'unknown';
  this.update({phase:'interrupted',cancelOutcome});
 }
 async remove(model:string,digest:string){
  if(this.busy||!this.allowed())throw Error('Another operation or AI request is active');
  const state=agentSettingsSnapshot();if(state.config.provider==='ollama'&&(state.config.model===model||state.config.model+':latest'===model))throw Error('This model is used by saved Agent settings. Choose and save a replacement first.');
  this.busy=true;
  try{if(!this.allowed())throw Error('AI request became active');await this.transport.remove(model,digest);const current=await this.runtime.snapshot();if(current.inventoryError||current.state!=='running'||current.models.some(m=>m.id===model))throw Error('Removal not confirmed. Refresh before retrying.');}
  finally{this.busy=false;this.listeners.forEach(listener=>listener());}
 }
}
export function classifyPullError(message:string):string {
 if(/space|disk full/i.test(message))return 'Not enough disk space';
 if(/not found|manifest|404/i.test(message))return 'Registry model or variant not found';
 if(/digest|checksum|integrity/i.test(message))return 'Model integrity verification failed';
 if(/permission|denied/i.test(message))return 'Model storage permission denied';
 return 'Daemon reported a download error';
}
export const localModelManager=new LocalModelManager();
