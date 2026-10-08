/** Native AI document boundary. No disk, shell, network, or model-owned acceptance. */
export type StudioKind = 'code' | 'photo' | 'designer' | 'documents' | 'unsupported';
export interface DocumentRef { documentId:string; path:string; studioKind:StudioKind; revision:number; adapter:string|null }
export interface SelectionRef { from:number; to:number; nodeId?:string }
export interface DocumentSnapshot { ref:DocumentRef; text:string }
export interface DocumentAdapter { id:string; kind:StudioKind; validate(text:string):void }
const bytes=(s:string)=>new TextEncoder().encode(s).byteLength;
export function studioFor(path:string):StudioKind {
 if(/\.(html?|css|[cm]?js|jsx|tsx?|json|md)$/i.test(path))return 'code';
 if(/\.(png|jpe?g|webp)$/i.test(path))return 'photo';
 if(/\.svg$/i.test(path))return 'designer';
 if(/\.(pdf|docx)$/i.test(path))return 'documents';
 return 'unsupported';
}
export class DocumentRegistry {
 private serial=0;private observedRevision:number|undefined;
 private entries=new Map<string,{ref:DocumentRef;text:string}>();
 constructor(private readonly adapters:readonly DocumentAdapter[]=[]){ }
 sync(files:Readonly<Record<string,string>>,revision?:number):void {
  const changed=revision!==undefined&&this.observedRevision!==undefined&&revision!==this.observedRevision;this.observedRevision=revision;
  for(const path of this.entries.keys())if(!Object.hasOwn(files,path))this.entries.delete(path);
  for(const [path,text] of Object.entries(files)){
   const e=this.entries.get(path);
   if(e){if(e.text!==text||changed){e.text=text;e.ref={...e.ref,revision:e.ref.revision+1};}}
   else {const kind=studioFor(path);this.entries.set(path,{text,ref:{documentId:`document-${++this.serial}`,path,studioKind:kind,revision:0,adapter:this.adapters.find(a=>a.kind===kind)?.id??null}});}
  }
 }
 /** Explicit rename keeps identity. Remove/reopen creates a new identity. */
 rename(from:string,to:string):void {const e=this.entries.get(from);if(!e||this.entries.has(to)||studioFor(to)!==e.ref.studioKind)throw Error('Invalid document rename.');this.entries.delete(from);e.ref={...e.ref,path:to,revision:e.ref.revision+1};this.entries.set(to,e);}
 clear():void {this.entries.clear();this.observedRevision=undefined;}
 snapshot(path:string):DocumentSnapshot {const e=this.entries.get(path);if(!e)throw Error('Document is no longer open.');return structuredClone({ref:e.ref,text:e.text});}
 assert(ref:DocumentRef):DocumentSnapshot {const s=this.snapshot(ref.path);if(s.ref.documentId!==ref.documentId||s.ref.revision!==ref.revision)throw Error('Document changed. Refresh the proposal and preview.');return s;}
 validate(ref:DocumentRef,text:string):void {const a=this.adapters.find(a=>a.id===ref.adapter&&a.kind===ref.studioKind);if(!a)throw Error('No implemented adapter for this document.');a.validate(text);}
}
export type EffectClass='inspect'|'disclose'|'edit'|'external-effect';
export interface PolicyRequest { effect:EffectClass; documentIds:readonly string[]; destination?:string; proposalId?:string }
export interface PolicyGrant extends PolicyRequest { }
/** Grants are host-owned. Document/model text cannot grant privileges. */
export class PolicyGateway {
 private grants:PolicyGrant[]=[];
 grant(value:PolicyGrant):void {this.grants.push(structuredClone(value));}
 revoke():void {this.grants=[];}
 assert(request:PolicyRequest):void {
  if(request.effect==='external-effect')throw Error('External effects are not available in native studio mode.');
  if(!this.grants.some(g=>g.effect===request.effect&&g.destination===request.destination&&g.proposalId===request.proposalId&&request.documentIds.every(id=>g.documentIds.includes(id))))throw Error(`${request.effect} permission is required for this scope.`);
 }
}
export interface ContextPackage { document:DocumentRef; selection:SelectionRef|null; data:{trust:'untrusted-document'; text:string; from:number; to:number}; bytes:number }
export function buildContext(registry:DocumentRegistry,policy:PolicyGateway,path:string,selection:SelectionRef|null,maxBytes=64*1024):ContextPackage {
 const s=registry.snapshot(path);policy.assert({effect:'inspect',documentIds:[s.ref.documentId]});
 const from=selection?.from??0,to=selection?.to??s.text.length;
 if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<from||to>s.text.length)throw Error('Selection is outside the document.');
 const text=s.text.slice(from,to);const size=bytes(text);
 if(size>maxBytes)throw Error('Context exceeds limit. Select a smaller range.');
 return {document:s.ref,selection:selection?{...selection}:null,data:{trust:'untrusted-document',text,from,to},bytes:size};
}
export interface NativeProposal { id:string;runId:string;base:DocumentRef;before:string;after:string;state:'review'|'accepted'|'rejected'|'undone';origin:string }
export interface TransactionPort { hold(path:string):Promise<void>;apply(path:string,text:string,origin:string):void;undo(origin:string):void;canAccept():boolean }
/** One-document atomic in-memory transactions. Revalidate AFTER every await. */
export class TransactionManager {
 private proposals=new Map<string,NativeProposal>();private serial=0;private accepting=new Set<string>();
 constructor(private registry:DocumentRegistry,private policy:PolicyGateway,private port:TransactionPort){ }
 propose(runId:string,base:DocumentRef,after:string):NativeProposal {
  const s=this.registry.assert(base);this.policy.assert({effect:'inspect',documentIds:[base.documentId]});this.registry.validate(base,after);
  if(s.text===after)throw Error('Proposal makes no change.');
  const id=`proposal-${++this.serial}`;const p:NativeProposal={id,runId,base:{...base},before:s.text,after,state:'review',origin:`ai:${runId}:${id}`};this.proposals.set(id,p);return structuredClone(p);
 }
 get(id:string):NativeProposal {const p=this.proposals.get(id);if(!p)throw Error('Unknown native proposal.');return structuredClone(p);}
 reject(id:string):void {const p=this.proposals.get(id);if(!p||p.state!=='review')throw Error('Proposal is not pending.');p.state='rejected';}
 async accept(id:string,reviewedAfter:string):Promise<void> {
  const p=this.proposals.get(id);if(!p)throw Error('Unknown native proposal.');
  if(reviewedAfter!==p.after)throw Error('Acceptance does not match the preview.');
  if(p.state==='accepted')return; // idempotent, no second mutation
  if(p.state!=='review')throw Error('Proposal is not pending.');
  const check=()=>{if(!this.port.canAccept())throw Error('Only the collaboration host may accept AI changes.');this.policy.assert({effect:'edit',documentIds:[p.base.documentId],proposalId:id});const s=this.registry.assert(p.base);if(s.text!==p.before)throw Error('Proposal base changed.');this.registry.validate(p.base,p.after);};
  if(this.accepting.has(id))throw Error('Acceptance is already in progress.');
  this.accepting.add(id);try{check();await this.port.hold(p.base.path);check();
   if(p.state!=='review')throw Error('Proposal is no longer pending.');
   this.port.apply(p.base.path,p.after,p.origin);p.state='accepted';
  }finally{this.accepting.delete(id);}
 }
 undo(id:string):void {
  const p=this.proposals.get(id);if(!p||p.state!=='accepted')throw Error('No accepted AI transaction to undo.');
  if(!this.port.canAccept())throw Error('Only the collaboration host may undo AI changes.');
  // Core verifies the origin group is the history head. Never restore over later edits.
  this.port.undo(p.origin);p.state='undone';
 }
 clear():void {this.proposals.clear();}
}
