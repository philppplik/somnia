import type {ManifestV2} from './manifestV2';
export interface ActivationContext {interactive:boolean;studio:string;languages:readonly string[];documentExtensions:readonly string[];hasProject:boolean;workspaceTrusted:boolean;virtualWorkspace:boolean;projectPaths:readonly string[];indexComplete:boolean;hasSelection?:boolean;isReadonly?:boolean}
export type ActivationEvent={type:'command'|'panel'|'language'|'studio'|'document';value:string}|{type:'project'|'selection'|'startup'|'enable'|'workspace'};
export function workspaceGlobMatches(glob:string,path:string):boolean {
 if(glob.length>128||/[{}!()[\]\\]/.test(glob)||glob.split('/').some(p=>p==='..'||p==='.'))return false;
 let pattern='^';for(let i=0;i<glob.length;i++) {
  const c=glob[i];if(c==='*'&&glob[i+1]==='*'){i++;if(glob[i+1]==='/'){i++;pattern+='(?:[^/]+/)*';}else pattern+='.*';}
  else if(c==='*')pattern+='[^/]*';else if(c==='?')pattern+='[^/]';else pattern+=c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 }return new RegExp(pattern+'$').test(path);
}
/** Predicate rechecks use the current host snapshot, never buffered document/selection events. */
export function matchesActivation(m:ManifestV2,event:ActivationEvent,c:ActivationContext,now:()=>number=()=>performance.now()):boolean {
 if(!c.interactive||m.runtime.type==='declarative')return false;
 const start=now();return m.activationEvents.some(rule=>{
  if(rule==='*')return event.type==='enable'||event.type==='startup';
  if(rule==='onStartupFinished')return event.type==='startup';
  if(rule==='onProjectOpened')return c.hasProject&&(event.type==='project'||event.type==='enable');
  if(rule==='onSelectionChanged')return event.type==='selection'&&m.permissions.includes('selection');
  const colon=rule.indexOf(':');if(colon<0)return false;const kind=rule.slice(0,colon),value=rule.slice(colon+1);
  if(kind==='onCommand')return event.type==='command'&&event.value===value;
  if(kind==='onPanel')return event.type==='panel'&&event.value===value;
  if(kind==='onLanguage')return (event.type==='language'&&event.value===value)||(event.type==='enable'&&c.languages.includes(value));
  if(kind==='onStudio')return (event.type==='studio'&&event.value===value)||(event.type==='enable'&&c.studio===value);
  if(kind==='onDocument')return (event.type==='document'&&event.value===value)||(event.type==='enable'&&c.documentExtensions.includes(value));
  if(kind==='workspaceContains'&&['workspace','enable','project'].includes(event.type)) {
   if(!c.workspaceTrusted||!c.hasProject||!c.indexComplete||c.projectPaths.length>10000||!m.permissions.includes('project.read'))return false;
   for(const path of c.projectPaths){if(now()-start>50)return false;if(workspaceGlobMatches(value,path))return true;}
  }return false;
 });
}
/** Two concurrent launches, queued explicit user actions before background activation. */
export class ActivationQueue {
 private running=0;private queue:{priority:number;run:()=>void}[]=[];
 constructor(private readonly limit=2){}
 run<T>(work:()=>Promise<T>,userAction=false):Promise<T>{return new Promise((resolve,reject)=>{
  this.queue.push({priority:userAction?0:1,run:()=>{this.running++;Promise.resolve().then(work).then(resolve,reject).finally(()=>{this.running--;this.pump();});}});this.queue.sort((a,b)=>a.priority-b.priority);this.pump();
 });}
 private pump(){while(this.running<this.limit&&this.queue.length)this.queue.shift()!.run();}
}
