import type {PressureLevel} from '../lifecycle/manager';

/** The slice of ExtensionRuntime the suspender needs. */
export interface SuspendableHost{runCommand(id:string):Promise<void>;dispose():void}
export type IdleHostState='active'|'suspended';
export interface IdleSuspendOptions<H extends SuspendableHost>{
 /** Starts a fresh host (worker plus activation) for an extension. Must be synchronous so resume cannot race. */
 create(extId:string):H;
 /** Extensions bucket of the active lifecycle profile, in bytes (budgets.ts). */
 budgetBytes():number;
 /** Estimated resident bytes of one running host. Defaults to DEFAULT_HOST_BYTES. */
 estimateBytes?(extId:string):number;
 now?():number;
 /** Idle time before a host is suspended under normal pressure. */
 idleMs?:number;
 /** Idle time under 'pressure' and 'critical'. */
 pressureIdleMs?:number;
 /** A host is never suspended this soon after it started (covers activation). */
 minResidentMs?:number;
 pressure?():PressureLevel;
 isEnabled?():boolean;
 onChange?(extId:string,state:IdleHostState,reason:string):void;
}
export const DEFAULT_IDLE_MS=5*60_000;
export const DEFAULT_PRESSURE_IDLE_MS=60_000;
export const DEFAULT_MIN_RESIDENT_MS=10_000;
/** A sandboxed worker with its JS heap is a few MiB; the estimate keeps the 64 MiB bucket meaningful. */
export const DEFAULT_HOST_BYTES=4*1024*1024;

interface Entry<H>{host:H|null;lastActive:number;startedAt:number;inFlight:number;suspensions:number}

/**
 * Suspends extension hosts that have been idle and restarts them on demand.
 * Suspending terminates the worker. Extension code runs again on resume, which is the documented
 * activation contract (docs/extensions/06-lifecycle.md): state belongs in `storage`, not in globals.
 * Contributions (commands, panels, themes, snippets) are declarative and stay registered while suspended.
 * A host with a command in flight is never suspended.
 */
export class ExtensionIdleSuspender<H extends SuspendableHost>{
 private entries=new Map<string,Entry<H>>();
 private timer:ReturnType<typeof setInterval>|null=null;
 constructor(private o:IdleSuspendOptions<H>){}
 private now(){return(this.o.now??Date.now)();}
 /** Registers an extension and starts its host. */
 register(extId:string):void{
  if(this.entries.has(extId))return;
  const t=this.now();
  this.entries.set(extId,{host:this.o.create(extId),lastActive:t,startedAt:t,inFlight:0,suspensions:0});
 }
 state(extId:string):IdleHostState|undefined{const e=this.entries.get(extId);return e?(e.host?'active':'suspended'):undefined;}
 suspensions(extId:string):number{return this.entries.get(extId)?.suspensions??0;}
 residentBytes():number{let sum=0;for(const[id,e]of this.entries)if(e.host)sum+=this.o.estimateBytes?.(id)??DEFAULT_HOST_BYTES;return sum;}
 /** Marks activity (panel interaction, api traffic) without running a command. Resumes a suspended host. */
 touch(extId:string):void{const e=this.entries.get(extId);if(!e)return;e.lastActive=this.now();if(!e.host)this.resume(extId,e,'touch');}
 /** Runs a command, resuming the host first when it was suspended. */
 async run(extId:string,commandId:string):Promise<void>{
  const e=this.entries.get(extId);
  if(!e)throw new Error(`Unknown extension ${extId}.`);
  if(!e.host)this.resume(extId,e,'command');
  e.lastActive=this.now();e.inFlight++;
  try{await e.host!.runCommand(commandId);}
  finally{e.inFlight--;e.lastActive=this.now();}
 }
 private resume(extId:string,e:Entry<H>,reason:string){
  const t=this.now();e.host=this.o.create(extId);e.startedAt=t;e.lastActive=t;
  this.o.onChange?.(extId,'active',reason);
 }
 private suspend(extId:string,e:Entry<H>,reason:string){
  const h=e.host;if(!h)return;
  e.host=null;e.suspensions++;
  try{h.dispose();}catch{/* worker may already be gone */}
  this.o.onChange?.(extId,'suspended',reason);
 }
 /** One evaluation pass. Returns the ids suspended by it. */
 tick():string[]{
  if(this.o.isEnabled&&!this.o.isEnabled())return[];
  const t=this.now();
  const level=this.o.pressure?.()??'normal';
  const idleMs=level==='normal'?(this.o.idleMs??DEFAULT_IDLE_MS):(this.o.pressureIdleMs??DEFAULT_PRESSURE_IDLE_MS);
  const minResident=this.o.minResidentMs??DEFAULT_MIN_RESIDENT_MS;
  const out:string[]=[];
  const candidates=[...this.entries].filter(([,e])=>e.host&&e.inFlight===0&&t-e.startedAt>=minResident).sort((a,b)=>a[1].lastActive-b[1].lastActive);
  for(const[id,e]of candidates){if(t-e.lastActive>=idleMs){this.suspend(id,e,level==='normal'?'idle':'idle-pressure');out.push(id);}}
  // Over budget: suspend the least recently used remaining idle hosts until the bucket fits.
  const budget=this.o.budgetBytes();
  for(const[id,e]of candidates){
   if(this.residentBytes()<=budget)break;
   if(e.host){this.suspend(id,e,'budget');out.push(id);}
  }
  return out;
 }
 start(intervalMs=15_000):void{if(this.timer)return;this.timer=setInterval(()=>this.tick(),intervalMs);}
 /** Stops the timer and disposes every running host. */
 dispose():void{
  if(this.timer){clearInterval(this.timer);this.timer=null;}
  for(const e of this.entries.values()){if(e.host){try{e.host.dispose();}catch{/* ignore */}e.host=null;}}
  this.entries.clear();
 }
}
