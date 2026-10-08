import type {GitBackend,GitChange,GitErrorCode,GitRepoState,GitStatus,GitVersion} from '../../lib/git/types';
import {parseGitError} from './backend';
import {defaultSelection,isSelectable,isVisible,reconcileSelection} from './selection';
import {suggestSubject,validSubject,type Translate} from './commitText';

export interface ChangesState{
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
const initial=():ChangesState=>({phase:'loading',repoState:null,status:null,selected:new Set(),subject:'',subjectTouched:false,body:'',busy:null,error:null,saved:null,reviewAgain:false});

/**
 * View-model for the Changes tab. Talks only to GitBackend. Never commits on its own:
 * commit() runs only from an explicit user action and sends exactly the ticked paths with the reviewed stateToken.
 */
export class ChangesController{
 private s:ChangesState=initial();private ls=new Set<()=>void>();private seq=0;
 constructor(private b:GitBackend,private t:Translate){}
 setTranslate(t:Translate){this.t=t;this.autoSubject();}
 subscribe=(f:()=>void)=>{this.ls.add(f);return()=>{this.ls.delete(f);};};
 getState=()=>this.s;
 private set(p:Partial<ChangesState>){this.s={...this.s,...p};this.ls.forEach(f=>f());}
 visible():GitChange[]{return(this.s.status?.changes??[]).filter(isVisible);}
 selectedChanges():GitChange[]{return this.visible().filter(c=>this.s.selected.has(c.path));}
 canSave():boolean{const s=this.s;return s.phase==='ready'&&!s.busy&&s.selected.size>0&&validSubject(s.subject);}
 private autoSubject(){if(this.s.subjectTouched||this.s.phase!=='ready')return;this.s={...this.s,subject:suggestSubject(this.selectedChanges(),this.t)};this.ls.forEach(f=>f());}

 async refresh(opts:{keepSaved?:boolean}={}){
  const my=++this.seq;this.set({busy:'refresh',error:null,...(opts.keepSaved?{}:{saved:null})});
  try{
   const st=await this.b.detect();if(my!==this.seq)return;
   if(st.kind!=='ready'){this.set({phase:'repo',repoState:st,status:null,selected:new Set(),busy:null});return;}
   const status=await this.b.status();if(my!==this.seq)return;
   const before=this.s.status?.changes??[];
   const selected=this.s.status?reconcileSelection(this.s.selected,before,status.changes):defaultSelection(status.changes);
   this.s={...this.s,phase:'ready',repoState:st,status,selected,busy:null};this.autoSubject();this.set({});
  }catch(e){if(my!==this.seq)return;const g=parseGitError(e);this.set({phase:'error',busy:null,error:{code:g.code,detail:g.detail}});}
 }
 toggle(path:string){const c=this.visible().find(x=>x.path===path);if(!c||!isSelectable(c))return;
  const n=new Set(this.s.selected);n.has(path)?n.delete(path):n.add(path);this.s={...this.s,selected:n,saved:null};this.autoSubject();this.set({});}
 selectAll(on:boolean){this.s={...this.s,selected:on?new Set(this.visible().filter(isSelectable).map(c=>c.path)):new Set(),saved:null};this.autoSubject();this.set({});}
 setSubject(v:string){this.s={...this.s,subject:v,subjectTouched:v.trim()!=='',saved:null};if(!this.s.subjectTouched)this.autoSubject();this.set({});}
 setBody(v:string){this.set({body:v});}
 async init(){this.set({busy:'init',error:null});try{await this.b.init();}catch(e){const g=parseGitError(e);this.set({busy:null,error:{code:g.code,detail:g.detail}});return;}await this.refresh();}

 /** Save a version of the ticked files. Returns the version or null when it did not happen. */
 async commit():Promise<GitVersion|null>{
  if(!this.canSave()||!this.s.status)return null;
  const paths=this.selectedChanges().map(c=>c.path);const token=this.s.status.stateToken;
  this.set({busy:'commit',error:null,saved:null,reviewAgain:false});
  try{
   const v=await this.b.commit({paths,subject:this.s.subject.trim(),body:this.s.body.trim()||undefined,stateToken:token});
   this.s={...this.s,subject:'',subjectTouched:false,body:''};await this.refresh({keepSaved:true});this.set({saved:v});return v;
  }catch(e){
   const g=parseGitError(e);
   if(g.code==='state-changed'){await this.refresh();this.set({reviewAgain:true});return null;}
   this.set({busy:null,error:{code:g.code,detail:g.detail}});
   if(g.code==='nothing-to-commit')void this.refresh();
   return null;}
 }
}
/** Message key for an error code. Messages never include raw detail unless the Advanced view asks for it. */
export const errorKey=(c:GitErrorCode)=>`versions.error.${c}`;
export const blockedKey=(s:GitRepoState)=>s.kind==='no-git'?'versions.state.noGit':s.kind==='no-repo'?'versions.state.noRepo':s.kind==='blocked'?`versions.blocked.${s.reason}`:'';
