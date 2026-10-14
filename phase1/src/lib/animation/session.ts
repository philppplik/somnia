import {useSyncExternalStore} from 'react';
import {applyEdit,applyEdits,type Edit} from './edit';
import {createDocument,findComp,validateDocument,type AnimationDocument,type KeyRef} from './model';
import {clearJournal,defaultView,readJournal,writeJournal,type KeyValueStore,type ViewState} from './recovery';
import {snapToFrame} from './time';
import {ReviewedError,sameValue,type ReviewedKeyRequest,type ReviewedReceipt} from './reviewedCommit';
import {findLayer,type PropValue,type TransformKey} from './model';
export const HISTORY_LIMIT=200;
export interface SessionState{doc:AnimationDocument|null;view:ViewState;canUndo:boolean;canRedo:boolean;dirty:boolean;preview:AnimationDocument|null;renderSetup:boolean;recoveryFailed:boolean}
/**
 * One transaction/undo owner for the document. Edits commit snapshots (structural sharing keeps them small).
 * A drag calls `previewEdits` repeatedly (nothing is committed) and `commitPreview` once; `cancelPreview` restores.
 */
export class AnimationSession{
 private past:AnimationDocument[]=[];private future:AnimationDocument[]=[];
 private doc:AnimationDocument|null=null;private view:ViewState=defaultView();private savedRevision=-1;
 private preview:AnimationDocument|null=null;private previewBase:AnimationDocument|null=null;
 private renderSetup=false;private recoveryFailed=false;
 private listeners=new Set<()=>void>();private snap:SessionState;
 constructor(private store:KeyValueStore|null=null,private now:()=>number=Date.now){this.snap=this.compute();}
 private compute():SessionState{return {doc:this.doc,view:this.view,canUndo:this.past.length>0,canRedo:this.future.length>0,dirty:!!this.doc&&this.doc.revision!==this.savedRevision,preview:this.preview,renderSetup:this.renderSetup,recoveryFailed:this.recoveryFailed};}
 private emit(){this.snap=this.compute();this.listeners.forEach(l=>l());}
 subscribe=(l:()=>void)=>{this.listeners.add(l);return()=>{this.listeners.delete(l);};};
 getState=()=>this.snap;
 /** The document the viewer should draw: the live preview while dragging, else the committed document. */
 get visible(){return this.preview??this.doc;}
 get document(){return this.doc;}
 private checkpoint(){
  if(!this.doc)return;
  this.recoveryFailed=!!this.store&&!writeJournal({savedRevision:this.savedRevision,doc:this.doc,view:this.view},this.store,this.now());
 }
 open(doc:AnimationDocument,view:Partial<ViewState>={}){
  const errors=validateDocument(doc);if(errors.length)throw Error(errors.join('; '));
  this.past=[];this.future=[];this.doc=doc;this.preview=null;this.previewBase=null;this.view={...defaultView(),...view};this.savedRevision=doc.revision;this.renderSetup=false;this.checkpoint();this.emit();
 }
 createBlank(name?:string){this.open(createDocument(name));return this.doc!;}
 /** Restores the last recovery journal if it validates. A bad journal is untouched and reported as null. */
 recover():boolean{
  const j=readJournal(this.store);if(!j)return false;
  this.past=[];this.future=[];this.doc=j.doc;this.view=j.view;this.savedRevision=j.savedRevision;this.preview=null;this.renderSetup=false;this.emit();return true;
 }
 close(discardJournal=true){this.past=[];this.future=[];this.doc=null;this.preview=null;this.view=defaultView();this.savedRevision=-1;if(discardJournal)clearJournal(this.store);this.emit();}
 /** Apply one or more edits as a single undo step. Throws EditError and changes nothing on failure. */
 dispatch(edit:Edit|readonly Edit[]):AnimationDocument{
  if(!this.doc)throw new Error('No open animation document.');
  if(this.preview)this.cancelPreview();
  const next=Array.isArray(edit)?applyEdits(this.doc,edit as readonly Edit[]):applyEdit(this.doc,edit as Edit);
  if(next===this.doc)return next;
  this.past.push(this.doc);if(this.past.length>HISTORY_LIMIT)this.past.shift();
  this.future=[];this.doc=next;this.checkpoint();this.emit();return next;
 }

 private reviewed=new WeakMap<ReviewedReceipt,{before:AnimationDocument;after:AnimationDocument}>();
 /** Notify listeners and write the journal after a commit; failures are counted, never thrown. */
 private settle():number{
  let errors=0;
  try{this.checkpoint();}catch{errors++;this.recoveryFailed=true;}
  this.snap=this.compute();
  this.listeners.forEach(l=>{try{l();}catch{errors++;}});
  return errors;
 }
 private keyValue(doc:AnimationDocument,layer:string,prop:TransformKey,t:number):PropValue|undefined{
  const c=findComp(doc),l=c?findLayer(c,layer):undefined;return l?.transform[prop].keys.find(k=>k.t===t)?.v;
 }
 /** Reviewed synchronous commit of one existing transform key value. Refusals throw ReviewedError before any change. */
 applyReviewed(req:ReviewedKeyRequest):ReviewedReceipt{
  const d=this.doc;
  if(!d)throw new ReviewedError('no-document','No open animation document.');
  if(this.preview)throw new ReviewedError('preview-active','A drag preview is active.');
  if(d!==req.doc)throw new ReviewedError('stale-document','The document changed after the review.');
  const c=findComp(d),l=c?findLayer(c,req.layer):undefined;
  if(!c||!l)throw new ReviewedError('bad-target','Layer not found.');
  if(l.locked)throw new ReviewedError('locked','The layer is locked.');
  const now=this.keyValue(d,req.layer,req.prop,req.t);
  if(now===undefined)throw new ReviewedError('bad-target','No key at that time.');
  if(!sameValue(now,req.expected))throw new ReviewedError('stale-value','The key value changed after the review.');
  let next:AnimationDocument;
  try{next=applyEdit(d,{type:'prop.set',layer:req.layer,prop:req.prop,t:req.t,value:req.value});}
  catch(e){throw new ReviewedError('invalid',e instanceof Error?e.message:'Invalid value.');}
  const base={origin:req.origin,kind:'apply' as const,docId:d.id,layer:req.layer,prop:req.prop,t:req.t,beforeRevision:d.revision,before:now};
  if(next===d||sameValue(this.keyValue(next,req.layer,req.prop,req.t)??now,now))return Object.freeze({...base,afterRevision:d.revision,after:now,applied:0,postCommitErrors:0});
  this.past.push(d);if(this.past.length>HISTORY_LIMIT)this.past.shift();
  this.future=[];this.doc=next;
  const errors=this.settle();
  const back=this.doc?this.keyValue(this.doc,req.layer,req.prop,req.t):undefined;
  const ok=this.doc===next&&back!==undefined&&sameValue(back,this.keyValue(next,req.layer,req.prop,req.t) as PropValue);
  const receipt:ReviewedReceipt=Object.freeze({...base,afterRevision:next.revision,after:(back??req.value) as PropValue,applied:ok?1:null,postCommitErrors:errors});
  this.reviewed.set(receipt,{before:d,after:next});return receipt;
 }
 /** Undo exactly the reviewed step. Refuses after newer edits, manual changes, a different document or an active preview. */
 undoReviewed(r:ReviewedReceipt):ReviewedReceipt{
  const own=this.reviewed.get(r),d=this.doc;
  if(!own||r.kind!=='apply'||r.applied!==1)throw new ReviewedError('stale-history','Not a reviewed step of this session.');
  if(!d)throw new ReviewedError('no-document','No open animation document.');
  if(this.preview)throw new ReviewedError('preview-active','A drag preview is active.');
  if(d!==own.after||this.past[this.past.length-1]!==own.before)throw new ReviewedError('stale-history','Newer changes exist; undo refused.');
  this.future.push(d);this.doc=this.past.pop()!;
  const errors=this.settle();
  const back=this.doc?this.keyValue(this.doc,r.layer,r.prop,r.t):undefined;
  const ok=this.doc===own.before&&back!==undefined&&sameValue(back,r.before);
  return Object.freeze({...r,kind:'undo' as const,beforeRevision:r.afterRevision,afterRevision:own.before.revision,before:r.after,after:(back??r.before) as PropValue,applied:ok?1:null,postCommitErrors:errors});
 }
 undo(){if(!this.doc||!this.past.length)return false;this.cancelPreview();this.future.push(this.doc);this.doc=this.past.pop()!;this.checkpoint();this.emit();return true;}
 redo(){if(!this.doc||!this.future.length)return false;this.cancelPreview();this.past.push(this.doc);this.doc=this.future.pop()!;this.checkpoint();this.emit();return true;}
 previewEdits(edits:readonly Edit[]){
  if(!this.doc)throw new Error('No open animation document.');
  this.previewBase??=this.doc;this.preview=applyEdits(this.previewBase,edits);this.emit();
 }
 commitPreview(){
  if(!this.preview||!this.previewBase)return false;
  const next=this.preview;this.preview=null;
  const base=this.previewBase;this.previewBase=null;
  if(next===base){this.emit();return false;}
  this.past.push(base);this.future=[];this.doc=next;this.checkpoint();this.emit();return true;
 }
 cancelPreview(){if(!this.preview&&!this.previewBase)return;this.preview=null;this.previewBase=null;this.emit();}
 setView(patch:Partial<ViewState>){
  const comp=this.doc&&findComp(this.doc);
  const next={...this.view,...patch};
  if(patch.selectedLayer!==undefined&&patch.selectedLayer!==this.view.selectedLayer&&patch.selectedKeys===undefined){next.selectedKeys=[];next.selectedKey=null;}
  if(patch.selectedLayer!==undefined&&patch.selectedLayer!==this.view.selectedLayer&&patch.styleKeys===undefined)next.styleKeys=[];
  if(comp&&patch.playhead!==undefined)next.playhead=Math.min(comp.start+comp.duration,Math.max(comp.start,snapToFrame(patch.playhead,comp.fps)));
  this.view=next;this.emit();
 }
 /** Replaces the key selection; the primary key (last selected) mirrors into `selectedKey`. */
 selectKeys(keys:readonly KeyRef[]){const last=keys[keys.length-1];this.setView({selectedKeys:[...keys],selectedKey:last?{prop:last.prop,t:last.t}:null});}
 markSaved(id:string,revision:number):boolean{if(this.doc?.id!==id||this.doc.revision!==revision)return false;this.savedRevision=revision;clearJournal(this.store);this.recoveryFailed=false;this.emit();return true;}
 setRenderSetup(open:boolean){this.renderSetup=open;this.emit();}
 /** Called on studio switch: dirty data, history and playhead stay in memory; the journal gets a fresh checkpoint. */
 suspend(){this.cancelPreview();this.checkpoint();this.emit();}
}
let active:AnimationSession|null=null;
export function animationSession():AnimationSession{
 active??=new AnimationSession(typeof localStorage!=='undefined'?(()=>{try{return localStorage;}catch{return null;}})():null);return active;
}
export function setAnimationSession(s:AnimationSession|null){active=s;}
export function useAnimationState():SessionState{
 const s=animationSession();return useSyncExternalStore(s.subscribe,s.getState,s.getState);
}
