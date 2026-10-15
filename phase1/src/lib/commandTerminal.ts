import {useSyncExternalStore} from 'react';
export interface TerminalSnapshot {id:string;projectId:string;cwd:string;state:'running'|'exited'|'stopped'|'timedOut'|'failed';exitCode:number|null;output:string;truncated:boolean;outputComplete:boolean}
export interface TerminalProject {projectId:string;name:string;isCurrent?:()=>boolean;invoke:<T>(command:string,args?:Record<string,unknown>)=>Promise<T>}
export interface TerminalState {open:boolean;cwd:string|null;project:TerminalProject|null;run:TerminalSnapshot|null;busy:boolean;stopping:boolean;error:string;command:string}
const knownErrors=new Set(['invalidCommand','projectMissing','busy','alreadyRunning','shellMissing','unsupported','startFailed','denied','runMissing']);
function knownError(error:unknown){const text=error instanceof Error?error.message:String(error);const key=text.startsWith('terminal.')?text.slice(9):'';return knownErrors.has(key)?key:null;}
/** No persistence, no background command generation. Only the explicit dialog action calls run(). */
export class CommandTerminalSession {
 private state:TerminalState={open:false,cwd:null,project:null,run:null,busy:false,stopping:false,error:'',command:''};private listeners=new Set<()=>void>();private generation=0;private timer:ReturnType<typeof setTimeout>|undefined;
 constructor(private readonly interval=500){}
 read=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private patch(next:Partial<TerminalState>){this.state={...this.state,...next};this.listeners.forEach(f=>f());}
 open=()=>this.patch({open:true});close=()=>this.patch({open:false});
 setProject(project:TerminalProject|null){if(this.state.project===project)return;const old=this.state;this.generation++;if(this.timer)clearTimeout(this.timer);this.timer=undefined;if(old.project&&old.run?.state==='running')void old.project.invoke('terminal_stop',{runId:old.run.id}).catch(()=>{});this.patch({project,cwd:null,run:null,busy:false,stopping:false,error:'',command:''});if(project)void this.context(project,this.generation);}
 private async context(project:TerminalProject,generation:number){try{const cwd=await project.invoke<string>('terminal_context',{projectId:project.projectId});if(!cwd||typeof cwd!=='string')throw Error('unknown');if(generation===this.generation)this.patch({cwd,error:''});}catch{if(generation===this.generation)this.patch({error:'contextUnavailable'});}}
 async run(command:string){const project=this.state.project;if(project?.isCurrent&&!project.isCurrent()){this.setProject(null);return;}if(!project||!this.state.cwd||this.state.busy||this.state.run?.state==='running')return; if(!command.trim()||new TextEncoder().encode(command).length>4096||command.includes('\0')){this.patch({error:'invalidCommand'});return;}
  const generation=this.generation,id=crypto.randomUUID();this.patch({busy:true,error:'',command,run:null});
  try {const run=await project.invoke<TerminalSnapshot>('terminal_run',{projectId:project.projectId,command,requestId:id,expectedCwd:this.state.cwd});if(generation!==this.generation){void project.invoke('terminal_stop',{runId:id}).catch(()=>{});return;}if(run.id!==id||run.projectId!==project.projectId)throw Error('unknown');this.patch({run,busy:false});this.schedule(project,id,generation);}
  catch(error){if(generation!==this.generation)return;const known=knownError(error);this.patch({busy:false,error:known??'unknownStart',run:known?null:{id,projectId:project.projectId,cwd:'',state:'running',exitCode:null,output:'',truncated:false,outputComplete:false}});if(!known)this.schedule(project,id,generation);}
 }
 private schedule(project:TerminalProject,id:string,generation:number){if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=undefined;void this.poll(project,id,generation);},this.interval);}
 private async poll(project:TerminalProject,id:string,generation:number){try{const run=await project.invoke<TerminalSnapshot>('terminal_status',{runId:id});if(generation!==this.generation||this.state.run?.id!==id)return;if(run.id!==id||run.projectId!==project.projectId)throw Error('unknown');this.patch({run,error:'',stopping:run.state==='running'&&this.state.stopping});if(run.state==='running')this.schedule(project,id,generation);}catch{if(generation===this.generation&&this.state.run?.id===id)this.patch({error:'unknownStatus',stopping:false});}}
 refresh=async()=>{const {project,run}=this.state;if(project&&run)await this.poll(project,run.id,this.generation);else if(project)await this.context(project,this.generation);};
 async stop(){const {project,run}=this.state;if(!project||!run||run.state!=='running'||this.state.stopping)return;const generation=this.generation;this.patch({stopping:true,error:''});try{await project.invoke('terminal_stop',{runId:run.id});if(generation===this.generation)await this.poll(project,run.id,generation);}catch{if(generation===this.generation)this.patch({stopping:false,error:'unknownStop'});}}
}
export const commandTerminal=new CommandTerminalSession();
export const useCommandTerminal=()=>useSyncExternalStore(commandTerminal.subscribe,commandTerminal.read);
