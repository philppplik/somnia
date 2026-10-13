import type {ProjectRunner,RunnerHandle,RunnerLog,RunKind} from './runnerContract';
/** In-memory test backend. No filesystem, shell, SSH, credentials or external services. */
export function createMockProjectRunner(){const runs=new Map<string,RunnerHandle>();const listeners=new Map<string,Set<(line:RunnerLog)=>void>>();let n=0;
 const runner:ProjectRunner={async start(projectId,kind:RunKind){const id=`mock-${++n}`;const handle:RunnerHandle={id,projectId,kind,state:kind==='dev'?'running':'exited',exitCode:kind==='dev'?undefined:0,...(kind==='dev'?{port:18420,url:'http://127.0.0.1:18420/?somnia-preview-token='+'a'.repeat(64)}:{})};runs.set(id,handle);return handle;},async status(id){const handle=runs.get(id);if(!handle)throw Error('Unknown run');return handle;},async stop(id){const handle=runs.get(id);if(handle)runs.set(id,{...handle,state:'stopped'});},onLog(id,listener){const set=listeners.get(id)??new Set();set.add(listener);listeners.set(id,set);return()=>{set.delete(listener);};}};
 return {...runner,emit(id:string,line:RunnerLog){listeners.get(id)?.forEach(fn=>fn(line));},fail(id:string){const h=runs.get(id);if(h)runs.set(id,{...h,state:'exited',exitCode:1});}};
}
