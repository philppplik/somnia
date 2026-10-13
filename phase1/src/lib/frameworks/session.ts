import type {ProjectRunner,RunnerHandle,RunnerLog} from './runnerContract';
import {loopbackPreviewUrl} from './previewSecurity';
export interface FrameworkSession {projectId:string;state:'idle'|'installing'|'starting'|'running'|'failed';handle?:RunnerHandle;errorKey?:string;logs:readonly RunnerLog[]}
/** One preview per open project. Native owns limits, helper consent, timeouts and env scrub. */
export function createFrameworkSession(runner:ProjectRunner,redact:(s:string)=>string,onLog:(line:RunnerLog)=>void=()=>{}){
 let snapshot:FrameworkSession={projectId:'',state:'idle',logs:[]};let off:(()=>void)|undefined;let generation=0;const listeners=new Set<()=>void>();
 const set=(next:Partial<FrameworkSession>)=>{snapshot={...snapshot,...next};listeners.forEach(fn=>fn());};
 const watch=async(handle:RunnerHandle,own:number)=>{off?.();const unsubscribe=await runner.onLog(handle.id,event=>{if(own!==generation)return;const safe={stream:event.stream,line:redact(event.line).slice(0,4000)};set({logs:[...snapshot.logs.slice(-499),safe]});onLog(safe);});if(own!==generation)unsubscribe();else off=unsubscribe;};
 async function wait(handle:RunnerHandle,own:number){await watch(handle,own);while(handle.state==='running'){if(own!==generation){await runner.stop(handle.id);throw Error('cancelled');}await new Promise(resolve=>setTimeout(resolve,200));handle=await runner.status(handle.id);}if(handle.state!=='exited'||handle.exitCode!==0)throw Error('failed');}
 return {getSnapshot:()=>snapshot,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
  async start(projectId:string,install=false){const own=++generation;off?.();const previous=snapshot.handle;set({projectId,state:install?'installing':'starting',handle:undefined,errorKey:undefined,logs:[]});
   try{
    if(previous)await runner.stop(previous.id);if(own!==generation)return;
    if(install){const installed=await runner.start(projectId,'install');if(own!==generation){await runner.stop(installed.id);return;}set({handle:installed});await wait(installed,own);}
    if(own!==generation)return;set({state:'starting'});const handle=await runner.start(projectId,'dev');if(own!==generation){await runner.stop(handle.id);return;}
    try{if(!handle.url)throw Error('failed');loopbackPreviewUrl(handle.url);}catch{await runner.stop(handle.id);throw Error('failed');}
    set({state:'running',handle});await watch(handle,own);
   }catch{if(own===generation)set({state:'failed',errorKey:'frameworks.previewFailed'});}
  },
  async stop(){++generation;off?.();off=undefined;const handle=snapshot.handle;set({state:'idle',handle:undefined});if(handle)await runner.stop(handle.id);},
  async refresh(){const handle=snapshot.handle;if(!handle||snapshot.state!=='running')return;const status=await runner.status(handle.id);if(snapshot.handle?.id!==handle.id)return;if(status.state!=='running')set({state:'failed',errorKey:'frameworks.previewFailed',handle:status});}
 };
}
