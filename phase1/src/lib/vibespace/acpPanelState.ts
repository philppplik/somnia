import {createAcpClient,type AcpClientBinding,type AcpSessionState} from './acpNative';
export const ACP_LIMITS={sessions:4,prompt:100_000,events:500} as const;
export interface AcpPanelSession {key:string;name:string;state:AcpSessionState|null;readFailed:boolean;busy:boolean;turn:boolean;opened:boolean}
/** Keeps native session handles across docking/unmounts. Only the native bridge owns runs. */
export class AcpPanelStore {
 private rows:AcpPanelSession[]=[];private listeners=new Set<()=>void>();
 constructor(readonly client:AcpClientBinding){}
 snapshot=()=>this.rows;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private emit(){this.listeners.forEach(l=>l());}
 patch(key:string,update:Partial<AcpPanelSession>){this.rows=this.rows.map(r=>r.key===key?{...r,...update}:r);this.emit();}
 async launch(name:string,program:string,args:string[]){
  if(this.rows.filter(r=>!r.state||!['failed','closed'].includes(r.state.status)).length>=ACP_LIMITS.sessions)throw new Error('session_limit');
  const reply=await this.client.launch({name,program,args});
  this.rows=[...this.rows,{key:reply.sessionKey,name,state:null,readFailed:false,busy:false,turn:false,opened:false}];this.emit();
  await this.refresh(reply.sessionKey);return reply.sessionKey;
 }
 private reads=new Map<string,Promise<void>>();
 refresh(key:string):Promise<void>{
  const pending=this.reads.get(key);if(pending)return pending;
  const task=this.client.state(key).then(state=>{this.patch(key,{state,readFailed:false});},()=>{this.patch(key,{readFailed:true});}).finally(()=>{this.reads.delete(key);});
  this.reads.set(key,task);return task;
 }
 async action(key:string,operation:()=>Promise<unknown>,turn=false){
  const row=this.rows.find(r=>r.key===key);if(!row||row.busy||turn&&row.turn)throw new Error('busy');
  this.patch(key,turn?{turn:true}:{busy:true});
  try{return await operation();}finally{this.patch(key,turn?{turn:false}:{busy:false});await this.refresh(key);}
 }
}
export const nativeAcpPanelStore=new AcpPanelStore(createAcpClient());
export const promptLength=(text:string)=>Array.from(text).length;
