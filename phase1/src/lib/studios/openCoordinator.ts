import {resolveOpen,type OpenResolution,type ResolveOptions} from './openResolver';
import type {StudioId} from './registry';
/**
 * Smart Open coordinator: the ONE place that turns "the user opened these files" into a Studio switch.
 * Prepare-then-commit: every file is resolved and prepared without touching the session. Only after the whole batch is prepared
 * (and still current) are sessions committed, and the shell is focused once on the first success.
 * Failure, cancellation, unsupported/binary input and superseded requests leave the old session and Studio untouched.
 * It is dependency-injected so it can be unit tested without the app store.
 */
export type OpenIntent='open'|'restore'|'background';
/** Only an explicit Open moves the shell. Import, attach/convert and create-blank are not Open and never come through here. */
export const routesShell=(intent:OpenIntent)=>intent==='open';
export interface OpenInput{name:string;bytes:Uint8Array;/** Source identity for per-document preference; defaults to name. */key?:string}
export interface PreparedOpen{
 name:string;studioId:StudioId;
 /** Commit the session without focusing it. May still fail (replacement guard changed meanwhile). */
 commit():{ok:true;key:string}|{ok:false;error:string};
 /** Release temporary resources (object URLs, workers) of a candidate that is not committed. */
 dispose():void;
 /** Focus the committed document (tab/media activation). The coordinator then switches the Studio once. */
 focus(key:string):void;
}
export interface OpenDeps{
 prepare(input:OpenInput,resolution:Extract<OpenResolution,{status:'ready'|'safe-text-offer'}>):Promise<PreparedOpen>;
 /** Switch the shell. Must bypass the manual veto for explicit Open and report the final Studio. */
 switchStudio(studioId:StudioId,key:string):void;
 notify(text:string):void;
 /** A drag, text edit or tool gesture that cannot be abandoned: the whole open is cancelled untouched. */
 pendingGesture?():boolean;
 /** Per-document Studio override for this input (compatible only; the resolver checks compatibility). */
 preferred?(input:OpenInput):StudioId|undefined;
}
export interface OpenOutcome{name:string;studioId?:StudioId;status:'opened'|'choose-handler'|'safe-text-offer'|'unsupported'|'invalid'|'failed'|'cancelled';reason?:string;preview?:boolean}
export interface OpenReport{generation:number;superseded:boolean;cancelled:boolean;outcomes:OpenOutcome[];focused:OpenOutcome|null;summary:string}
export interface BatchOptions extends ResolveOptions{intent?:OpenIntent}
export function createOpenCoordinator(deps:OpenDeps){
 let generation=0;
 const label=(id:StudioId)=>id.charAt(0).toUpperCase()+id.slice(1);
 async function openFiles(inputs:readonly OpenInput[],opts:BatchOptions={}):Promise<OpenReport>{
  const gen=++generation;const intent=opts.intent??'open';
  const outcomes:OpenOutcome[]=[];const prepared:{input:OpenInput;p:PreparedOpen;out:OpenOutcome}[]=[];
  const stale=()=>gen!==generation;
  const disposeAll=()=>{for(const x of prepared)x.p.dispose();};
  const report=(over:Partial<OpenReport>,summary:string):OpenReport=>({generation:gen,superseded:false,cancelled:false,outcomes,focused:null,summary,...over});
  for(const input of inputs){
   const resolution=resolveOpen(input.name,input.bytes,{...opts,preferred:opts.preferred??deps.preferred?.(input)});
   if(resolution.status!=='ready'&&resolution.status!=='safe-text-offer'){
    outcomes.push({name:input.name,status:resolution.status,reason:resolution.reason});continue;}
   if(resolution.status==='safe-text-offer'){outcomes.push({name:input.name,status:'safe-text-offer',studioId:resolution.handler.studioId,reason:resolution.reason});continue;}
   try{
    const p=await deps.prepare(input,resolution);
    if(stale()){p.dispose();disposeAll();return report({superseded:true},'');}
    const out:OpenOutcome={name:input.name,status:'opened',studioId:p.studioId,preview:resolution.preview};
    prepared.push({input,p,out});
   }catch(error){
    if(stale()){disposeAll();return report({superseded:true},'');}
    outcomes.push({name:input.name,status:'failed',reason:error instanceof Error?error.message:String(error)});
   }
  }
  if(stale()){disposeAll();return report({superseded:true},'');}
  if(prepared.length&&routesShell(intent)&&deps.pendingGesture?.()){
   disposeAll();const text='Finish the current edit before opening another file.';deps.notify(text);
   return report({cancelled:true,outcomes:inputs.map(i=>({name:i.name,status:'cancelled' as const,reason:text}))},text);}
  let focused:OpenOutcome|null=null;let focusKey='';
  const committed:OpenOutcome[]=[];
  for(const x of prepared){
   const r=x.p.commit();
   if(!r.ok){x.p.dispose();outcomes.push({name:x.input.name,status:'failed',reason:r.error});continue;}
   outcomes.push(x.out);committed.push(x.out);
   if(!focused&&routesShell(intent)){focused=x.out;focusKey=r.key;x.p.focus(r.key);}
  }
  if(focused)deps.switchStudio(focused.studioId!,focusKey);
  const opened=outcomes.filter(o=>o.status==='opened');const bad=outcomes.length-opened.length;
  let summary:string;
  if(inputs.length===1){
   summary=opened[0]?`Opened ${opened[0].name} in ${label(opened[0].studioId!)}${opened[0].preview?' (read-only preview)':''}.`:`Could not open ${outcomes[0]?.name}: ${outcomes[0]?.reason??'unknown error'}`;
  }else summary=`Opened ${opened.length} file${opened.length===1?'':'s'}.${bad?` ${bad} could not be opened: ${outcomes.filter(o=>o.status!=='opened').slice(0,3).map(o=>`${o.name} (${o.reason})`).join('; ')}${bad>3?` and ${bad-3} more`:''}`:''}`;
  // Order of outcomes follows input order for reporting.
  const order=new Map(inputs.map((i,n)=>[i.name,n]));outcomes.sort((a,b)=>(order.get(a.name)??0)-(order.get(b.name)??0));
  deps.notify(summary);
  return report({focused},summary);
 }
 return{openFiles,generation:()=>generation};
}
