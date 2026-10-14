import {useSyncExternalStore} from 'react';
import {animationSession} from './session';
import {findComp} from './model';
import {newId} from './model';
import {addJob,clearFinished,jobProblem,markJob,nextPending,removeJob,requeue,type QueueJob} from './renderQueue';
import {exportState,exportApng,exportGif,exportWorkAreaSequence,exportWebM,cancelExport,withExportComp,exportSetupSnapshot,restoreExportSetup,setExportSettings,setExportTransparent} from './exportJob';
import {problemMessage,type ExportFormat,type ExportProblem} from './exportSettings';
/** Observable render queue. Jobs run one at a time through the normal exporters; a failed job is marked and the rest continue. */
interface QueueState{jobs:readonly QueueJob[];running:boolean}
let state:QueueState={jobs:[],running:false};let stop=false;const listeners=new Set<()=>void>();
const set=(p:Partial<QueueState>)=>{state={...state,...p};listeners.forEach(l=>l());};
export const queueState=()=>state;
export const useQueueState=()=>useSyncExternalStore(l=>{listeners.add(l);return()=>{listeners.delete(l);};},queueState,queueState);
type Deps=NonNullable<Parameters<typeof exportGif>[0]>;
const RUN:Record<ExportFormat,(d:Deps)=>Promise<string>>={sequence:d=>exportWorkAreaSequence(d),gif:d=>exportGif(d),apng:d=>exportApng(d),webm:d=>exportWebM(d)};
/** Captures the current export setup for the active composition. Refuses setups the exporter would refuse. */
export function addToQueue(format:ExportFormat){
 const doc=animationSession().document,comp=doc&&findComp(doc);if(!doc||!comp)throw new Error('Open an animation first.');
 const snap=exportSetupSnapshot(),bad=jobProblem(comp,format,snap.settings);if(bad)throw new Error(problemMessage(bad as ExportProblem));
 set({jobs:addJob(state.jobs,{id:newId('job'),comp:comp.id,compName:comp.name,format,settings:snap.settings,transparent:snap.transparent})});
}
export const removeFromQueue=(id:string)=>set({jobs:removeJob(state.jobs,id)});
export const clearQueueFinished=()=>set({jobs:clearFinished(state.jobs)});
export const cancelQueue=()=>{stop=true;cancelExport();};
/** `deps` lets tests inject a rasteriser and a saver; the app passes nothing. */
export async function runQueue(deps:Deps={}){
 if(state.running)throw new Error('The queue is already running.');if(exportState().status==='running')throw new Error('An export is running.');
 const doc=()=>animationSession().document;if(!doc())throw new Error('Open an animation first.');
 stop=false;set({running:true,jobs:requeue(state.jobs)});const snap=exportSetupSnapshot();
 try{
  for(let j=nextPending(state.jobs);j&&!stop;j=nextPending(state.jobs)){
   set({jobs:markJob(state.jobs,j.id,{status:'running'})});
   try{
    if(!doc()||!findComp(doc()!,j.comp))throw new Error('The composition no longer exists.');
    setExportSettings(j.settings);setExportTransparent(j.transparent);
    const file=await withExportComp(j.comp,()=>RUN[j.format](deps));
    set({jobs:markJob(state.jobs,j.id,{status:'done',fileName:file})});
   }catch(e){
    const msg=e instanceof Error?e.message:String(e);
    set({jobs:markJob(state.jobs,j.id,{status:stop?'cancelled':'error',message:msg})});
   }
  }
 }finally{restoreExportSetup(snap);stop=false;set({running:false});}
}
export const resetQueue=()=>{if(!state.running)set({jobs:[]});};
