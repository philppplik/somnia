import {chatReducer,initialChat,type ChatAction,type ChatState} from './chat';
import {createStreamSink} from './streaming';
import {getAgentCore,type AgentCore,type AgentRequest,type AgentRun} from './core';
import {setAgentActivity,subscribeAgentSettings,agentSettingsSnapshot} from './settingsRuntime';
/** One application-owned conversation, observed by whichever panel is mounted. */
export class AgentChatRuntime {
 private state:ChatState=initialChat;private listeners=new Set<()=>void>();private generation=0;
 private run:AgentRun|null=null;private sink:ReturnType<typeof createStreamSink>|null=null;
 private revision:number|undefined;
 constructor(private readonly core:()=>Promise<AgentCore>=getAgentCore){}
 snapshot=()=>this.state;
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
 dispatch=(action:ChatAction)=>{
  this.state=chatReducer(this.state,action);
  // Keep pending approval/proposal rows; trim old settled conversation only.
  if(this.state.items.length>256){const protectedItems=this.state.items.filter(i=>i.kind==='approval'||i.kind==='diff'&&i.state==='pending');const tail=this.state.items.slice(-200);this.state={...this.state,items:[...protectedItems.filter(i=>!tail.includes(i)),...tail]};}
  setAgentActivity(this.state.busy,this.state.items.some(i=>i.kind==='diff'&&i.state==='pending'));
  for(const fn of this.listeners)try{fn();}catch{/* observers cannot cancel work */}
 };
 configureRevision(revision:number){if(this.revision!==undefined&&this.revision!==revision)this.stop();this.revision=revision;}
 async send(request:AgentRequest){
  if(this.state.busy||!request.prompt.trim())return;
  const generation=++this.generation;this.dispatch({type:'send',text:request.prompt});
  this.sink?.close();const sink=createStreamSink(event=>{if(generation===this.generation)this.dispatch({type:'event',event});});this.sink=sink;
  try{const core=await this.core();if(generation!==this.generation)return;this.run=core.run(request,event=>{if(generation===this.generation)sink.receive(event);});}
  catch{if(generation===this.generation)sink.receive({type:'error',message:'Agent could not start. Check your configuration and try again.',retryable:true});}
 }
 stop(){this.sink?.close(true);this.generation++;this.run?.cancel();this.run=null;this.dispatch({type:'stop'});}
 async reset(){this.stop();(await this.core()).clear?.();this.dispatch({type:'reset'});}
}
export const agentChatRuntime=new AgentChatRuntime();
agentChatRuntime.configureRevision(agentSettingsSnapshot().revision);
const stopSettingsWatch=subscribeAgentSettings(()=>agentChatRuntime.configureRevision(agentSettingsSnapshot().revision));
if(import.meta.hot)import.meta.hot.dispose(()=>{stopSettingsWatch();agentChatRuntime.stop();});
