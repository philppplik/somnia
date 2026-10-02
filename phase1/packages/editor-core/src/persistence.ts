import { EditorProject, type Origin, type Transaction } from './index.js';
export type SaveStatus = {state:'dirty'|'saving'|'saved'|'error';revision:number;message:string};
export interface ProjectStorage { write(files:Readonly<Record<string,string>>,revision:number):Promise<void>; recover?(state:ReturnType<EditorProject['exportState']>):Promise<void> }
/** Serializes saves and never calls an edit saved if it happened during a disk write. */
export class SaveCoordinator {
 private current:SaveStatus;
 private running:Promise<void>|null=null;
 private dirty=true;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private disposed=false;
 private off:()=>void;
 private listeners=new Set<(status:SaveStatus)=>void>();
 constructor(private project:EditorProject,private storage:ProjectStorage,private delay=700){
  this.current={state:'dirty',revision:project.revision,message:'Not saved to disk'};
  this.off=project.subscribe('internal',()=>{this.dirty=true;this.publish('dirty','Unsaved changes');this.schedule();});
 }
 get status(){return {...this.current};}
 subscribe(fn:(status:SaveStatus)=>void){this.listeners.add(fn);fn(this.status);return()=>{this.listeners.delete(fn);};}
 private publish(state:SaveStatus['state'],message:string){this.current={state,revision:this.project.revision,message};for(const f of this.listeners)f(this.status);}
 private schedule(){clearTimeout(this.timer);if(!this.disposed)this.timer=setTimeout(()=>{void this.flush().catch(()=>{});},this.delay);}
 async cacheRecovery(){if(!this.storage.recover)return;try{await this.storage.recover(this.project.exportState());}catch(e){this.publish('error',`Recovery cache failed: ${String(e)}. Disk save is still required.`);throw e;}}
 async flush():Promise<void>{
  if(this.disposed)throw Error('Save coordinator closed');clearTimeout(this.timer);if(this.running){await this.running; if(this.dirty)return this.flush();return;}
  if(!this.dirty)return;
  const revision=this.project.revision,files=this.project.files;
  this.publish('saving','Writing project files...');
  this.running=(async()=>{try{await this.storage.write(files,revision);if(this.project.revision===revision){this.dirty=false;this.publish('saved','Saved to disk');}else{this.dirty=true;this.publish('dirty','New edits are not yet saved');this.schedule();}}catch(e){this.dirty=true;this.publish('error',`Save failed: ${String(e)}. Your changes remain unsaved.`);throw e;}finally{this.running=null;}})();
  return this.running;
 }
 dispose(){this.disposed=true;clearTimeout(this.timer);this.off();this.listeners.clear();}
}
