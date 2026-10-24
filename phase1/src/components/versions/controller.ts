import type {GitBackend,GitChange,GitErrorCode,GitRepoState,GitStatus,GitVersion,GitCommitRequest} from '../../lib/git/types';
import {finalizeCommitMessage,DEFAULT_ATTRIBUTION_POLICY,type AttributionPolicy} from '../../lib/git/attribution/footer';
import {parseGitError} from './backend';
import {defaultSelection,isSelectable,isVisible,reconcileSelection} from './selection';
import {suggestSubject,validSubject,type Translate} from './commitText';

/** Host-owned provenance, never inferred from model text or a user typing in Changes. */
export interface CommitContext {origin:'human'|'app'; aiDrafted:boolean; substantive:boolean; sessionId?:string; policy?:AttributionPolicy}
export interface CommitReview {request:GitCommitRequest; footer:readonly string[]; message:string}
const HUMAN_CONTEXT:CommitContext={origin:'human',aiDrafted:false,substantive:false};
export interface ChangesState{
 review:CommitReview|null;
 phase:'loading'|'repo'|'ready'|'error';
 repoState:GitRepoState|null;
 status:GitStatus|null;
 selected:ReadonlySet<string>;
 subject:string;subjectTouched:boolean;body:string;
 busy:'refresh'|'commit'|'init'|null;
 error:{code:GitErrorCode;detail?:string}|null;
 /** Set after a successful save, cleared by the next edit/refresh. */
 saved:GitVersion|null;
 /** The status changed under the user (state-changed); the list was reloaded and the user must look again. */
 reviewAgain:boolean;
}
const initial=():ChangesState=>({review:null,phase:'loading',repoState:null,status:null,selected:new Set(),subject:'',subjectTouched:false,body:'',busy:null,error:null,saved:null,reviewAgain:false});

/**
 * View-model for the Changes tab. Talks only to GitBackend. Never commits on its own:
 * commit() runs only from an explicit user action and sends exactly the ticked paths with the reviewed stateToken.
 */
export class ChangesController{
 private s:ChangesState=initial();private ls=new Set<()=>void>();private seq=0;private invalidated=false;private context:CommitContext={...HUMAN_CONTEXT};
 constructor(private b:GitBackend,private t:Translate){}
 /** Called during render: never notify here (a notification re-renders the caller forever). The suggestion refreshes on the next user or refresh action. */
 setTranslate(t:Translate){this.t=t;}
 subscribe=(f:()=>void)=>{this.ls.add(f);return()=>{this.ls.delete(f);};};
 getState=()=>this.s;
 private set(p:Partial<ChangesState>){this.s={...this.s,...p};this.ls.forEach(f=>f());}
 visible():GitChange[]{return(this.s.status?.changes??[]).filter(isVisible);}
 selectedChanges():GitChange[]{return this.visible().filter(c=>this.s.selected.has(c.path));}
 canSave():boolean{const s=this.s;return s.phase==='ready'&&!s.busy&&s.selected.size>0&&validSubject(s.subject);}
 private autoSubject(){if(this.s.subjectTouched||this.s.phase!=='ready')return;this.s={...this.s,subject:suggestSubject(this.selectedChanges(),this.t)};this.ls.forEach(f=>f());}

 /** Never race a commit/init with watcher refresh; replay the hint after the mutation settles. */
 invalidate(){this.set({review:null});if(this.s.busy){this.invalidated=true;return;}void this.refresh();}
 private drainInvalidation(){if(this.invalidated&&!this.s.busy){this.invalidated=false;void this.refresh();}}
 async refresh(opts:{keepSaved?:boolean}={}){
  const my=++this.seq;this.set({review:null,busy:'refresh',error:null,...(opts.keepSaved?{}:{saved:null})});
  try{
   const st=await this.b.detect();if(my!==this.seq)return;
   if(st.kind!=='ready'){this.set({phase:'repo',repoState:st,status:null,selected:new Set(),busy:null});return;}
   const status=await this.b.status();if(my!==this.seq)return;
   const before=this.s.status?.changes??[];
   const selected=this.s.status?reconcileSelection(this.s.selected,before,status.changes):defaultSelection(status.changes);
   this.s={...this.s,phase:'ready',repoState:st,status,selected,busy:null};this.autoSubject();this.set({});
  }catch(e){if(my!==this.seq)return;const g=parseGitError(e);this.set({phase:'error',busy:null,error:{code:g.code,detail:g.detail}});}
  finally {this.drainInvalidation();}
 }
 toggle(path:string){const c=this.visible().find(x=>x.path===path);if(!c||!isSelectable(c))return;
  const n=new Set(this.s.selected);n.has(path)?n.delete(path):n.add(path);this.s={...this.s,selected:n,saved:null,review:null};this.autoSubject();this.set({});}
 selectAll(on:boolean){this.s={...this.s,selected:on?new Set(this.visible().filter(isSelectable).map(c=>c.path)):new Set(),saved:null,review:null};this.autoSubject();this.set({});}
 setSubject(v:string){this.s={...this.s,subject:v,subjectTouched:v.trim()!=='',saved:null,review:null};if(!this.s.subjectTouched)this.autoSubject();this.set({});}
 setBody(v:string){this.set({body:v,review:null});}
 async init(){this.set({busy:'init',error:null});try{await this.b.init();}catch(e){const g=parseGitError(e);this.set({busy:null,error:{code:g.code,detail:g.detail}});this.drainInvalidation();return;}await this.refresh();}

 /** Set only by a host that owns the commit origin and accepted content evidence. */
 setCommitContext(context:CommitContext){const next={...context,policy:context.policy?{...context.policy}:undefined};
  if(JSON.stringify(next)!==JSON.stringify(this.context)){this.context=next;this.set({review:null});}}
 /** Finalize once for review. Confirmation sends this exact snapshot, never re-finalizes it. */
 reviewCommit():CommitReview|null{
  if(!this.canSave()||!this.s.status)return null;
  const i=this.context;
  const final=finalizeCommitMessage({subject:this.s.subject,body:this.s.body,aiDrafted:i.aiDrafted,
   substantive:i.substantive,origin:i.origin,policy:i.policy??DEFAULT_ATTRIBUTION_POLICY,sessionId:i.sessionId});
  const request:GitCommitRequest={paths:this.selectedChanges().map(c=>c.path),subject:final.subject,body:final.body||undefined,stateToken:this.s.status.stateToken};
  Object.freeze(request.paths);Object.freeze(request);
  const review=Object.freeze({request,footer:Object.freeze([...final.footer]),message:[final.subject,final.body].filter(Boolean).join('\n\n')});
  this.set({review});return review;
 }
 cancelReview(){this.set({review:null});}
 /** Only the exact visible, current review can be confirmed. Git re-checks stateToken atomically. */
 async commit(review:CommitReview|null=this.s.review):Promise<GitVersion|null>{
  if(!review||review!==this.s.review||!this.canSave()||!this.s.status||review.request.stateToken!==this.s.status.stateToken)return null;
  const request=review.request;
  this.set({review:null,busy:'commit',error:null,saved:null,reviewAgain:false});
  try{
   const v=await this.b.commit(request);
   this.s={...this.s,subject:'',subjectTouched:false,body:''};await this.refresh({keepSaved:true});this.set({saved:v});this.drainInvalidation();return v;
  }catch(e){
   const g=parseGitError(e);
   if(g.code==='state-changed'){await this.refresh();this.set({reviewAgain:true});return null;}
   this.set({busy:null,error:{code:g.code,detail:g.detail}});
   if(g.code==='nothing-to-commit')void this.refresh();
   this.drainInvalidation();return null;}
 }
}
/** Message key for an error code. Messages never include raw detail unless the Advanced view asks for it. */
export const errorKey=(c:GitErrorCode)=>`versions.error.${c}`;
export const blockedKey=(s:GitRepoState)=>s.kind==='no-git'?'versions.state.noGit':s.kind==='no-repo'?'versions.state.noRepo':s.kind==='blocked'?`versions.blocked.${s.reason}`:'';
