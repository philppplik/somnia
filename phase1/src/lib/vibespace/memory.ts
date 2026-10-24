/** Memory panel logic (package A6). Pure state + a transport interface; no Tauri import here.
 * Rules the tests pin: vector search is opt-in per space, the model download needs the exact size acknowledged,
 * nothing downloads or indexes by itself, FTS keeps working whatever the vector state is. */
export type MemoryKind='fact'|'preference'|'note';
export type MemorySource='user'|'agent'|'imported'|'skill';
export type MemoryConsent='user_explicit'|'user_approved'|'pending_review';
export interface MemoryItem{id:string;spaceId:string;kind:MemoryKind;title:string|null;content:string;provenance:{source:MemorySource;sourceRef:string|null;consent:MemoryConsent};createdAt:string}
export interface VectorStatus{spaceId:string;compiledIn:boolean;enabled:boolean;modelId:string|null;dims:number|null;indexed:number;total:number}
export interface ModelState{modelId:string;status:'missing'|'ready'|'downloading'|'error';totalBytes:number;downloadedBytes:number;error?:string}
export interface MemoryHit{item:MemoryItem;score:number|null;fromFts:boolean;fromVector:boolean}
export interface MemorySearch{mode:'hybrid'|'fts5'|'like_fallback';vectorFallbackReason:string|null;hits:MemoryHit[]}
export interface MemoryTransport{
 list(spaceId:string,includePending:boolean):Promise<MemoryItem[]>;
 add(spaceId:string,kind:MemoryKind,title:string|null,content:string):Promise<MemoryItem>;
 remove(spaceId:string,id:string):Promise<boolean>;
 review(spaceId:string,id:string,approve:boolean):Promise<boolean>;
 clearAll(spaceId:string):Promise<number>;
 search(spaceId:string,query:string):Promise<MemorySearch>;
 vectorStatus(spaceId:string):Promise<VectorStatus>;
 modelState():Promise<ModelState>;
 /** `acknowledgedBytes` must equal the total size the UI showed. */
 downloadModel(acknowledgedBytes:number):Promise<ModelState>;
 cancelModelDownload():Promise<ModelState>;
 enableVector(spaceId:string,acknowledged:true):Promise<VectorStatus>;
 disableVector(spaceId:string):Promise<VectorStatus>;
}
export function formatBytes(n:number):string{
 if(!Number.isFinite(n)||n<0)return '?';
 if(n<1024)return `${n} B`;
 const u=['KB','MB','GB'];let v=n/1024,i=0;while(v>=1024&&i<u.length-1){v/=1024;i++;}
 return `${v>=100?Math.round(v):v.toFixed(1)} ${u[i]}`;
}
export function downloadPercent(m:ModelState):number{return m.totalBytes>0?Math.min(100,Math.floor(m.downloadedBytes*100/m.totalBytes)):0;}
export type VectorPhase='unavailable'|'off'|'needs-model'|'downloading'|'ready-to-enable'|'indexing'|'on';
export function vectorPhase(s:VectorStatus,m:ModelState):VectorPhase{
 if(!s.compiledIn)return 'unavailable';
 if(s.enabled)return s.indexed<s.total?'indexing':'on';
 if(m.status==='downloading')return 'downloading';
 if(m.status!=='ready')return 'needs-model';
 return 'ready-to-enable';
}
/** The "off" phase is only reachable by the user declining; kept for the UI toggle label. */
export const canDownload=(s:VectorStatus,m:ModelState)=>s.compiledIn&&(m.status==='missing'||m.status==='error');
export const canEnable=(s:VectorStatus,m:ModelState,acknowledged:boolean)=>s.compiledIn&&!s.enabled&&m.status==='ready'&&acknowledged;
export function provenanceLabel(i:MemoryItem):{source:string;consent:string;needsReview:boolean}{
 const src={user:'You',agent:'Agent',imported:'Imported',skill:'Skill'}[i.provenance.source];
 const consent={user_explicit:'Added by you',user_approved:'Approved by you',pending_review:'Waiting for your review'}[i.provenance.consent];
 return {source:i.provenance.sourceRef?`${src} · ${i.provenance.sourceRef}`:src,consent,needsReview:i.provenance.consent==='pending_review'};
}
export function searchModeLabel(s:MemorySearch):string{
 if(s.mode==='hybrid')return 'Keyword + meaning';
 const why:Record<string,string>={vector_not_opted_in:'meaning search is off',embedder_unavailable:'model not loaded',embedder_model_mismatch:'model changed, re-index needed',vector_index_empty:'not indexed yet'};
 const reason=s.vectorFallbackReason?(why[s.vectorFallbackReason]??'meaning search unavailable'):null;
 return s.mode==='fts5'?`Keyword${reason?` (${reason})`:''}`:`Plain text fallback${reason?` (${reason})`:''}`;
}
export interface MemoryViewState{items:MemoryItem[];vector:VectorStatus|null;model:ModelState|null;search:MemorySearch|null;error:string|null;busy:boolean}
export const initialMemoryState:MemoryViewState={items:[],vector:null,model:null,search:null,error:null,busy:false};
/** Small external-store controller (React useSyncExternalStore friendly). */
export class MemoryController{
 private state:MemoryViewState=initialMemoryState;private listeners=new Set<()=>void>();
 constructor(private t:MemoryTransport,private spaceId:string){}
 subscribe=(f:()=>void)=>{this.listeners.add(f);return()=>{this.listeners.delete(f);};};
 getSnapshot=()=>this.state;
 private set(p:Partial<MemoryViewState>){this.state={...this.state,...p};this.listeners.forEach(f=>f());}
 private async run<T>(f:()=>Promise<T>):Promise<T|undefined>{
  this.set({busy:true,error:null});
  try{return await f();}catch(e){this.set({error:e instanceof Error?e.message:String(e)});return undefined;}finally{this.set({busy:false});}
 }
 async refresh(){await this.run(async()=>{const [items,vector,model]=await Promise.all([this.t.list(this.spaceId,true),this.t.vectorStatus(this.spaceId),this.t.modelState()]);this.set({items,vector,model});});}
 async add(kind:MemoryKind,title:string,content:string){if(!content.trim())return;await this.run(async()=>{await this.t.add(this.spaceId,kind,title.trim()||null,content.trim());});await this.refresh();}
 async remove(id:string){await this.run(()=>this.t.remove(this.spaceId,id));await this.refresh();}
 async review(id:string,approve:boolean){await this.run(()=>this.t.review(this.spaceId,id,approve));await this.refresh();}
 async clearAll(){await this.run(()=>this.t.clearAll(this.spaceId));this.set({search:null});await this.refresh();}
 async search(q:string){if(!q.trim()){this.set({search:null});return;}const r=await this.run(()=>this.t.search(this.spaceId,q.trim()));if(r)this.set({search:r});}
 async downloadModel(){const m=this.state.model,v=this.state.vector;if(!m||!v||!canDownload(v,m))return;await this.run(()=>this.t.downloadModel(m.totalBytes));await this.refresh();}
 async cancelDownload(){await this.run(()=>this.t.cancelModelDownload());await this.refresh();}
 async enableVector(acknowledged:boolean){const m=this.state.model,v=this.state.vector;if(!m||!v||!canEnable(v,m,acknowledged))return;await this.run(()=>this.t.enableVector(this.spaceId,true));await this.refresh();}
 async disableVector(){await this.run(()=>this.t.disableVector(this.spaceId));await this.refresh();}
}
