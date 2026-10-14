/** Application-owned jobs. A view lifetime is never a cancellation signal. */
export type JobPriority=0|1|2|3;
export type JobState='queued'|'running'|'completed'|'cancelled'|'failed';
export interface JobSpec {
 id?:string; kind:'save'|'playback'|'activation'|'export'|'ai'|'maintenance';
 documentId?:string; revision?:number; priority:JobPriority;
 estimatedBytes?:number; resources?:readonly string[];
 /** Serialize access to singleton engines without pinning the studio view. */
 exclusive?:readonly string[];
 signal?:AbortSignal; cancellable?:boolean;
}
export interface JobRecord {
 id:string;kind:JobSpec['kind'];documentId?:string;revision?:number;priority:JobPriority;
 state:JobState;estimatedBytes:number;resources:readonly string[];progress:number|null;cancellable:boolean;
}
export interface JobLease {id:string;signal:AbortSignal;progress(ratio:number):void;release(state?:'completed'|'failed'|'cancelled'):void;}
interface Pending {spec:JobSpec;record:JobRecord;controller:AbortController;resolve:(lease:JobLease)=>void;reject:(error:unknown)=>void;cleanup:()=>void;order:number;}
export interface JobSchedulerOptions {backgroundConcurrency?:number;interactiveConcurrency?:number;realtimeConcurrency?:number;maxQueued?:number;maxBytes?:number;historyLimit?:number;agingMs?:number;now?:()=>number;}
export class JobScheduler {
 private queue:Pending[]=[];private active=new Map<string,Pending>();private history:JobRecord[]=[];
 private listeners=new Set<()=>void>();private counter=0;private snapshot:readonly JobRecord[]=Object.freeze([]);
 private pressure:'normal'|'pressure'|'critical'='normal';private interaction=false;
 private readonly limits;private readonly now:()=>number;private enqueuedAt=new Map<string,number>();
 constructor(options:JobSchedulerOptions={}){
  this.limits={background:options.backgroundConcurrency??2,interactive:options.interactiveConcurrency??2,realtime:options.realtimeConcurrency??2,queue:options.maxQueued??64,bytes:options.maxBytes??256*1024*1024,history:options.historyLimit??32,aging:options.agingMs??30_000};
  for(const [key,n]of Object.entries(this.limits))if(!Number.isSafeInteger(n)||n<1)throw Error(`Invalid job limit: ${key}`);
  this.now=options.now??(()=>performance.now());
 }
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 list=()=>this.snapshot;
 hasLease(resourceId:string){return [...this.active.values()].some(p=>p.record.resources.includes(resourceId));}
 /** Pending dependencies also prohibit disposal before their job is admitted. */
 needsResource(resourceId:string){return this.hasLease(resourceId)||this.queue.some(p=>p.record.resources.includes(resourceId));}
 setPressure(value:'normal'|'pressure'|'critical'){this.pressure=value;this.drain();}
 setInteracting(value:boolean){this.interaction=value;this.drain();}
 private emit(){this.snapshot=Object.freeze([...this.active.values()].map(p=>p.record).concat(this.queue.map(p=>p.record),this.history).map(r=>Object.freeze({...r,resources:Object.freeze([...r.resources])}))); for(const fn of this.listeners)try{fn();}catch{/* observers do not own jobs */}}
 private remember(p:Pending,state:JobState){p.record.state=state;p.cleanup();this.enqueuedAt.delete(p.record.id);this.history.push({...p.record});if(this.history.length>this.limits.history)this.history.shift();}
 acquire(spec:JobSpec):Promise<JobLease>{
  if(![0,1,2,3].includes(spec.priority))return Promise.reject(Error('Invalid job priority'));
  const bytes=spec.estimatedBytes??0;
  if(!Number.isSafeInteger(bytes)||bytes<0||bytes>this.limits.bytes)return Promise.reject(Error('Job reservation exceeds budget'));
  if(this.queue.length>=this.limits.queue)return Promise.reject(Error('Job queue is full'));
  if(spec.signal?.aborted)return Promise.reject(spec.signal.reason??new DOMException('Job cancelled','AbortError'));
  const id=spec.id??`job-${++this.counter}`;
  if(this.active.has(id)||this.queue.some(p=>p.record.id===id))return Promise.reject(Error('Duplicate job id'));
  return new Promise((resolve,reject)=>{
   const controller=new AbortController();
   const p:Pending={spec:{...spec,resources:[...(spec.resources??[])],exclusive:[...(spec.exclusive??[])]},record:{id,kind:spec.kind,documentId:spec.documentId,revision:spec.revision,priority:spec.priority,state:'queued',estimatedBytes:bytes,resources:[...new Set([...(spec.resources??[]),...(spec.exclusive??[])])],progress:null,cancellable:spec.cancellable!==false},controller,resolve,reject,cleanup:()=>{},order:++this.counter};
   const abort=()=>this.cancel(id,spec.signal?.reason);
   spec.signal?.addEventListener('abort',abort,{once:true});p.cleanup=()=>spec.signal?.removeEventListener('abort',abort);
   this.enqueuedAt.set(id,this.now());this.queue.push(p);this.drain();
  });
 }
 cancel(id:string,reason:unknown=new DOMException('Job cancelled','AbortError')){
  const i=this.queue.findIndex(p=>p.record.id===id);
  if(i>=0){const p=this.queue[i];if(!p.record.cancellable)return false;this.queue.splice(i,1);p.controller.abort(reason);this.remember(p,'cancelled');p.reject(reason);this.drain();return true;}
  const p=this.active.get(id);if(!p||!p.record.cancellable)return false;p.controller.abort(reason);this.emit();return true;
  // Running reservations remain held until the callback acknowledges cancellation and releases.
 }
 async run<T>(spec:JobSpec,operation:(lease:JobLease)=>Promise<T>):Promise<T>{
  const lease=await this.acquire(spec);
  try{lease.signal.throwIfAborted();const result=await operation(lease);lease.signal.throwIfAborted();lease.release();return result;}
  catch(e){lease.release(lease.signal.aborted?'cancelled':'failed');throw e;}
 }
 private admissible(p:Pending){
  const running=[...this.active.values()];
  const lane=(priority:JobPriority)=>priority===0?'realtime':priority===1?'interactive':'background';
  const group=lane(p.record.priority);if(running.filter(a=>lane(a.record.priority)===group).length>=this.limits[group])return false;
  if(p.record.priority===3&&(this.pressure!=='normal'||this.interaction))return false;
  if(p.record.priority>=2&&this.pressure==='critical')return false;
  if(running.reduce((sum,a)=>sum+a.record.estimatedBytes,0)+p.record.estimatedBytes>this.limits.bytes)return false;
  return !running.some(a=>p.spec.exclusive!.some(id=>a.spec.exclusive!.includes(id)));
 }
 private drain(){
  // P0/P1 are never demoted. Aging orders the background lane so maintenance can eventually progress.
  const effective=(p:Pending)=>p.record.priority<2?p.record.priority:Math.max(2,p.record.priority-Math.floor((this.now()-(this.enqueuedAt.get(p.record.id)??this.now()))/this.limits.aging));
  this.queue.sort((a,b)=>effective(a)-effective(b)||a.order-b.order);
  for(let i=0;i<this.queue.length;){const p=this.queue[i];if(!this.admissible(p)){i++;continue;}
   this.queue.splice(i,1);p.record.state='running';this.active.set(p.record.id,p);
   let released=false;
   p.resolve({id:p.record.id,signal:p.controller.signal,progress:ratio=>{if(released||!Number.isFinite(ratio))return;p.record.progress=Math.min(1,Math.max(0,ratio));this.emit();},release:(state='completed')=>{if(released)return;released=true;this.active.delete(p.record.id);this.remember(p,p.controller.signal.aborted?'cancelled':state);this.drain();}});
  }this.emit();
 }
}
export const jobScheduler=new JobScheduler();
