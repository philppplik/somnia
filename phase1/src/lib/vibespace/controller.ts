import {canApply,studioControls,initialVibeState,vibeReducer,type VibeViewState} from './state';
import {parseEvent,parseSnapshot,validateCommand} from './validation';
import type {VibeEvent,VibeIntent,VibeSpaceTransport} from './types';
/** Presentation lifecycle only. No timers or TS orchestration. */
export class VibeSpaceController {
 private state:VibeViewState=initialVibeState;
 private listeners=new Set<()=>void>();
 private generation=0;
 private unsubscribe:(()=>void)|undefined;
 private events:VibeEvent[]=[];
 private inFlight=false;
 private reconciling=false;
 private loadingRead=false;
 private faults=0;
 constructor(readonly transport:VibeSpaceTransport){}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private update(action:Parameters<typeof vibeReducer>[1]){this.state=vibeReducer(this.state,action);this.listeners.forEach(l=>l());}
 private error(error:unknown){this.faults++;this.update({type:'error',message:error instanceof Error?error.message:'Vibe Space could not complete the request.'});}
 private receive(raw:VibeEvent){
  try{
   const event=parseEvent(raw);
   if(this.loadingRead){if(this.events.length>=1000)throw new Error('Too many events before Vibe Space loaded. Reload the panel.');this.events.push(event);return;}
   const current=this.state.snapshot?.studios.find(s=>s.runId===event.runId);
   if(current&&(event.payload.studioId!==current.studioId||event.payload.spaceId!==current.spaceId))throw new Error('Run identity changed. Reload to reconcile before acting.');
   if(current&&event.sequence<=current.sequence)return;
   if(!current||event.sequence!==current.sequence+1){
    this.error(new Error('Run state needs reconciliation. Actions are locked while native state is reloaded.'));
    this.events.push(event);void this.reconcile();return;
   }
   this.update({type:'event',event});
  }catch(e){this.error(e);}
 }
 private async read(generation:number){
  this.loadingRead=true;const faults=this.faults;
  try{
   const snapshot=parseSnapshot(await this.transport.snapshot());if(generation!==this.generation)return false;
   this.update({type:'snapshot',snapshot});
   const queued=this.events;this.events=[];
   for(const event of queued){
    const current=this.state.snapshot?.studios.find(s=>s.runId===event.runId);
    if(!current||event.sequence>current.sequence+1){this.events.push(event);this.error(new Error('Native read is behind the event stream. Reload to reconcile before acting.'));return false;}
    if(event.sequence>current.sequence)this.update({type:'event',event});
   }
   return faults===this.faults;
  }catch(e){if(generation===this.generation)this.error(e);return false;}
  finally{if(generation===this.generation)this.loadingRead=false;}
 }
 private async reconcile(){
  if(this.reconciling)return;
  this.reconciling=true;
  const generation=this.generation;
  try{if(await this.read(generation)&&generation===this.generation)this.update({type:'clear-error'});}
  finally{this.reconciling=false;}
 }
 async connect(){
  const generation=++this.generation;this.error(new Error('Loading native state. Actions are locked.'));this.unsubscribe?.();this.events=[];this.loadingRead=true;
  try{
   const off=await this.transport.subscribe(raw=>{if(generation===this.generation)this.receive(raw);},e=>{if(generation===this.generation)this.error(e);});
   if(generation!==this.generation){off();return;}this.unsubscribe=off;
   const clean=await this.read(generation);
   if(clean&&generation===this.generation)this.update({type:'clear-error'});
   else if(this.events.length&&generation===this.generation)void this.reconcile();
  }catch(e){if(generation===this.generation){this.loadingRead=false;this.error(e);}}
 }
 disconnect(){this.generation++;this.unsubscribe?.();this.unsubscribe=undefined;this.events=[];this.loadingRead=false;}
 async refresh(){this.error(new Error('Reloading native state. Actions are locked.'));await this.reconcile();}
 async execute(intent:VibeIntent):Promise<boolean>{
  if(this.inFlight||this.loadingRead||this.reconciling||!this.state.snapshot||this.state.error||!this.transport.capabilities.includes(intent.type))return false;
  if(intent.type==='start'&&!this.state.snapshot.sessions.some(s=>s.studioId===intent.studioId&&s.canStart)){this.error(new Error('Studio cannot start. Reload native state.'));return false;}
  if('runId' in intent){
   const studio=this.state.snapshot.studios.find(s=>s.runId===intent.runId);
   if(!studio){this.error(new Error('Target run is not loaded.'));return false;}
   const controls=studioControls(studio,false);
   const denied=intent.type==='stop'&&!controls.stop||intent.type==='steer'&&!controls.steer||intent.type==='restore'&&!controls.restore||intent.type==='retry'&&!controls.retry;
   if(denied){this.error(new Error('Action is unavailable for this run.'));return false;}
   if(intent.type==='consent'){
    const consent=studio.pendingConsents.find(c=>c.requestId===intent.requestId);
    if(!controls.consent||!consent||intent.choice==='allow_for_run'&&!consent.allowForRun){this.error(new Error('Consent request changed. Reload and review it again.'));return false;}
   }
   if(intent.type==='review'&&(!controls.review||intent.reviewRevision!==studio.review?.revision||intent.decision==='apply'&&!canApply(studio,intent.paths,false))){this.error(new Error('Review changed or contains conflicts. Reload and review it again.'));return false;}
   if(intent.type==='restore'&&!studio.checkpoints.some(c=>c.checkpointId===intent.checkpointId&&c.restorable)){this.error(new Error('Checkpoint is not restorable.'));return false;}
  }
  const generation=this.generation;
  const command={...intent,commandId:commandId(),expectedRevision:this.state.snapshot.revision};
  this.inFlight=true;this.update({type:'pending',pending:true});
  try{
   validateCommand(command);const snapshot=parseSnapshot(await this.transport.execute(command));if(generation!==this.generation)return false;
   this.update({type:'snapshot',snapshot});return true;
  }catch(e){if(generation===this.generation)this.error(e);return false;}
  finally{this.inFlight=false;if(generation===this.generation)this.update({type:'pending',pending:false});}
 }
 async chooseFolder(){try{return await this.transport.chooseFolder();}catch(e){this.error(e);return null;}}
}

/** getRandomValues works in offline/insecure fixture contexts where randomUUID is absent. */
function commandId():string{
 if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
