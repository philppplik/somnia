import Ajv2020 from 'ajv/dist/2020.js';
import type {ManifestV2} from './manifestV2';
import {isSafePackagePath} from './manifestV2';
import {API_PERMISSIONS,ExtensionError,type ApiMethod,type ApiMethods,type EditRequest,type EditResult,type ProjectFile,type Json,type SelectionSnapshot} from './contracts/v2/api';
import {checkJson,MAX_RPC_BYTES} from './v2/rpc';
export interface BrokerPolicy {enabled:boolean;trusted:boolean;virtual:boolean;permissions:ReadonlySet<string>}
export interface BrokerServices {
 listFiles(signal:AbortSignal):Promise<ProjectFile[]>;
 readFile(path:string,signal:AbortSignal):Promise<{text:string;revision:string}>;
 selection(signal:AbortSignal):Promise<SelectionSnapshot|null>;
 /** Must check ALL revisions and signal at the actual commit and perform one undoable atomic transaction. No retries. */
 commit(request:EditRequest,signal:AbortSignal):Promise<EditResult>;
 storage:{entries():Promise<Readonly<Record<string,string>>>;set(key:string,value:string,signal:AbortSignal):Promise<void>;delete(key:string,signal:AbortSignal):Promise<void>};
 notify(text:string):void;
 postPanel(panelId:string,message:Json):void;
 subscribe(kind:'project'|'selection'|'panel',callbackId:number,panelId?:string):()=>void;
}
function invalid():never {throw new ExtensionError('E_INVALID_ARGUMENT','Invalid API arguments.');}
function object(value:unknown,keys:readonly string[],required:readonly string[]=keys):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!keys.includes(k))||required.some(k=>!Object.hasOwn(v,k)))invalid();return v;
}
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const path=(v:unknown):v is string=>typeof v==='string'&&isSafePackagePath(v);
const string=(v:unknown,max=100):v is string=>typeof v==='string'&&v.length>0&&new TextEncoder().encode(v).length<=max;
const schemas=new Ajv2020({strict:false,allErrors:true});
/** Denials and workspace limits are live state; no cached enabled flag grants capabilities. */
export class ExtensionBroker {
 readonly handlers=new Map<string,number>();
 private subscriptions=new Map<number,()=>void>();private seq=0;private revoked=false;
 private window=Date.now();private calls=0;private writes=0;private active=0;
 private storageQueue:Promise<unknown>=Promise.resolve();
 constructor(readonly manifest:ManifestV2,private readonly policy:()=>BrokerPolicy,private readonly services:BrokerServices){}
 check(method:ApiMethod):void {
  const p=this.policy();if(this.revoked||!p.enabled)throw new ExtensionError('E_CANCELLED','Extension session was revoked.');
  if(p.virtual&&!this.manifest.capabilities.virtualWorkspaces.supported)throw new ExtensionError('E_WORKSPACE_UNTRUSTED','Extension does not support this workspace.');
  const u=this.manifest.capabilities.untrustedWorkspaces;
  if(!p.trusted&&u.supported==='unsupported')throw new ExtensionError('E_WORKSPACE_UNTRUSTED','Extension requires a trusted workspace.');
  const needed=API_PERMISSIONS[method];if(needed&&(!this.manifest.permissions.includes(needed)||!p.permissions.has(needed)||(!p.trusted&&u.supported==='limited'&&!u.allowedPermissions?.includes(needed))))throw new ExtensionError('E_PERMISSION_DENIED','Extension permission is not granted.');
 }
 assertLaunch():void {this.check('panels.postMessage');}
 validateCommand(id:string,value:Json,result=false):void {
  const command=this.manifest.contributes.commands?.find(c=>c.id===id);if(!command)invalid();const schema=command[result?'resultSchema':'argumentsSchema'];
  checkJson(value);if(schema&&!schemas.compile(schema as object)(value))invalid();
 }
 async call<M extends ApiMethod>(method:M,params:ApiMethods[M]['params'],signal:AbortSignal):Promise<ApiMethods[M]['result']> {
  if(!Object.hasOwn(API_PERMISSIONS,method))invalid();checkJson(params);if(new TextEncoder().encode(JSON.stringify(params)).length>MAX_RPC_BYTES)throw new ExtensionError('E_RESOURCE_LIMIT','API request exceeds 1 MiB.');
  this.check(method);if(signal.aborted)throw new ExtensionError('E_CANCELLED','Request cancelled.');
  if(Date.now()-this.window>=1000){this.window=Date.now();this.calls=0;this.writes=0;}
  if(++this.calls>100||this.active>=32||(method==='editor.applyOperations'&&++this.writes>10))throw new ExtensionError('E_RESOURCE_LIMIT','Extension API limit exceeded.');
  this.active++;
  try {const result=await this.route(method,params,signal);if(method!=='editor.applyOperations')this.check(method);if(method!=='editor.applyOperations'&&signal.aborted)throw new ExtensionError('E_CANCELLED','Request cancelled.');checkJson(result);
   if(new TextEncoder().encode(JSON.stringify(result)).length>MAX_RPC_BYTES)throw new ExtensionError('E_RESOURCE_LIMIT','API result exceeds 1 MiB.');return result as ApiMethods[M]['result'];
  }finally{this.active--;}
 }
 private async route(method:ApiMethod,params:unknown,signal:AbortSignal):Promise<unknown> {
  switch(method){
   case 'commands.register':{const p=object(params,['id','callbackId']);if(!string(p.id)||!positive(p.callbackId)||!this.manifest.contributes.commands?.some(c=>c.id===p.id))invalid();if(this.handlers.has(p.id))invalid();this.handlers.set(p.id,p.callbackId);return null;}
   case 'project.listFiles':object(params,[]);return this.services.listFiles(signal);
   case 'project.readFile':{const p=object(params,['path']);if(!path(p.path))invalid();const result=await this.services.readFile(p.path,signal);if(new TextEncoder().encode(result.text).length>512*1024)throw new ExtensionError('E_RESOURCE_LIMIT','File read exceeds 512 KiB.');return result;}
   case 'selection.get':object(params,[]);return this.services.selection(signal);
   case 'editor.applyOperations':return this.services.commit(validateEdit(params),signal);
   case 'project.onDidChange':case 'selection.onDidChange':case 'panels.onMessage':{
    const panel=method==='panels.onMessage';const p=object(params,panel?['panelId','callbackId']:['callbackId']);if(!positive(p.callbackId))invalid();if(panel)this.panel(p.panelId);
    const id=++this.seq;this.subscriptions.set(id,this.services.subscribe(panel?'panel':method==='project.onDidChange'?'project':'selection',p.callbackId,panel?p.panelId as string:undefined));return id;}
   case 'subscriptions.dispose':{const p=object(params,['subscriptionId']);if(!positive(p.subscriptionId))invalid();this.subscriptions.get(p.subscriptionId)?.();this.subscriptions.delete(p.subscriptionId);return null;}
   case 'storage.get':{const p=object(params,['key']);if(!string(p.key))invalid();const entries=await this.services.storage.entries();return Object.hasOwn(entries,p.key)?entries[p.key]:null;}
   case 'storage.set':case 'storage.delete':{
    const p=object(params,method==='storage.set'?['key','value']:['key']);if(!string(p.key)||['__proto__','constructor','prototype'].includes(p.key))invalid();const key=p.key;
    if(method==='storage.set'&&(typeof p.value!=='string'||new TextEncoder().encode(p.value).length>64*1024))invalid();
    const work=async()=>{this.check(method);if(signal.aborted)throw new ExtensionError('E_CANCELLED','Request cancelled.');if(method==='storage.delete'){await this.services.storage.delete(key,signal);return null;}
     const entries=await this.services.storage.entries();let bytes=0;for(const [k,v] of Object.entries(entries))if(k!==key)bytes+=new TextEncoder().encode(k+v).length;
     bytes+=new TextEncoder().encode(key+(p.value as string)).length;if(bytes>5*1024*1024)throw new ExtensionError('E_RESOURCE_LIMIT','Extension storage exceeds 5 MiB.');this.check(method);if(signal.aborted)throw new ExtensionError('E_CANCELLED','Request cancelled.');await this.services.storage.set(key,p.value as string,signal);return null;};
    const result=this.storageQueue.then(work,work);this.storageQueue=result.catch(()=>{});return result;}
   case 'ui.notify':{const p=object(params,['text']);if(!string(p.text,200))invalid();this.services.notify(p.text);return null;}
   case 'panels.postMessage':{const p=object(params,['panelId','message']);this.panel(p.panelId);checkJson(p.message);this.services.postPanel(p.panelId as string,p.message);return null;}
  }
 }
 private panel(id:unknown):void {if(typeof id!=='string'||!this.manifest.contributes.panels?.some(p=>`${this.manifest.id}.${p.id}`===id))invalid();}
 revoke():void {this.revoked=true;this.handlers.clear();for(const dispose of this.subscriptions.values()){try{dispose();}catch{/* disposal cannot block revocation */}}this.subscriptions.clear();}
}
export function validateEdit(input:unknown):EditRequest {
 const request=object(input,['baseRevisions','operations']);const revisions=request.baseRevisions;
 if(!revisions||typeof revisions!=='object'||Array.isArray(revisions))invalid();for(const [file,revision] of Object.entries(revisions))if(!path(file)||!string(revision,200))invalid();
 if(!Array.isArray(request.operations)||request.operations.length<1||request.operations.length>50)invalid();
 const shapes:Record<string,string[]>={setText:['nodeId','text'],setAttribute:['nodeId','name','value'],setStyle:['nodeId','properties','cssFile','breakpoint'],insertHTML:['parentId','html','beforeId'],remove:['nodeId'],move:['nodeId','parentId','beforeId'],formatText:['nodeId','from','to','mark']};
 const optional=new Set(['cssFile','breakpoint','beforeId']);
 for(const input of request.operations){if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.type!=='string'||!Object.hasOwn(shapes,input.type))invalid();const fields=shapes[input.type];const op=object(input,['type','file',...fields],['type','file',...fields.filter(f=>!optional.has(f))]);
  if(!path(op.file)||!Object.hasOwn(revisions,op.file))invalid();
  for(const field of fields){const v=op[field];if(v===undefined&&optional.has(field))continue;
   if(['from','to','breakpoint'].includes(field)){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<(field==='breakpoint'?1:0))invalid();}
   else if(field==='properties'){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>200)invalid();for(const [key,value] of Object.entries(v))if(!key||key.length>100||(value!==null&&typeof value!=='string'))invalid();}
   else if(field==='value'&&op.type==='setAttribute'&&v===null)continue;
   else if(typeof v!=='string'||(['nodeId','parentId','beforeId'].includes(field)&&(!v||v.length>200)))invalid();
  }
  if(op.cssFile!==undefined&&!path(op.cssFile))invalid();
  if(op.type==='formatText'&&(!['strong','em','u'].includes(op.mark as string)||(op.to as number)<(op.from as number)))invalid();
 }
 return structuredClone(input) as EditRequest;
}
