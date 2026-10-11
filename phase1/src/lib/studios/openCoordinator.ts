import {resolveOpen,type OpenResolution,type ResolveOptions} from './openResolver';
import type {StudioId} from './registry';
import {collectTokens,type RevisionToken} from './revisionTokens';
export type {RevisionToken} from './revisionTokens';
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
export interface OpenInput{name:string;bytes:Uint8Array;/** Source identity for per-document preference; defaults to name. */key?:string;
 /** Native intake correlation. Basenames are NOT identity; outcomes are keyed by position and, when present, these. */
 requestId?:string;ordinal?:number;/** Opaque host file identity; a document already open under it is activated, not opened twice. */identityToken?:string}
/** A document the open would touch or replace. Captured at prepare time WITHOUT mutating the session. */
export interface AffectedDoc{key:string;studioId:StudioId;dirty:boolean;token:RevisionToken}
export interface PreparedOpen{
 name:string;studioId:StudioId;
 /** Documents this open may replace or change. Pure read: no session mutation. */
 affectedDocs():AffectedDoc[];
 /** Commit the session without focusing it. Stays synchronous so nothing can interleave after revalidation. May still fail (replacement guard changed meanwhile). */
 commit():{ok:true;key:string}|{ok:false;error:string};
 /** Release temporary resources (object URLs, workers) of a candidate that is not committed. */
 dispose():void;
 /** Focus the committed document (tab/media activation). The coordinator then switches the Studio once. */
 focus(key:string):void;
}
export interface OpenPlan{generation:number;requestId?:string;items:{input:OpenInput;prepared:PreparedOpen}[];affected:AffectedDoc[];revisionTokens:RevisionToken[]}
export interface OpenDeps{
 prepare(input:OpenInput,resolution:Extract<OpenResolution,{status:'ready'|'safe-text-offer'}>):Promise<PreparedOpen>;
 /** Async, fail-closed user approval of everything the plan would replace. Resolve 'approved' immediately when nothing dirty is affected. A throw is treated as 'cancelled'. */
 approve(plan:OpenPlan):Promise<'approved'|'cancelled'>;
 /** Synchronous: are all revision tokens of the plan still current? */
 revalidate(plan:OpenPlan):boolean;
 /** Switch the shell. Must bypass the manual veto for explicit Open and report the final Studio. */
 switchStudio(studioId:StudioId,key:string):void;
 notify(text:string):void;
 /** A drag, text edit or tool gesture that cannot be abandoned: the whole open is cancelled untouched. */
 pendingGesture?():boolean;
 /** Per-document Studio override for this input (compatible only; the resolver checks compatibility). */
 preferred?(input:OpenInput):StudioId|undefined;
 /** Studios that hold exactly one document: of several planned items only the first one per Studio is opened, the rest are deferred. */
 singleDocument?(studioId:StudioId):boolean;
 /** Renderer half of the same-file rule: a document already open under this identity token. */
 findOpenDocument?(identityToken:string):{studioId:StudioId;key:string}|undefined;
 /** Called exactly once per open when approve() threw (fail-closed). The coordinator has already cancelled; this is for logging only (SOM-UI-006). */
 approvalFailed?(requestId:string|undefined,error:unknown):void;
}
export type OpenOutcomeStatus='opened'|'choose-handler'|'safe-text-offer'|'unsupported'|'invalid'|'failed'|'cancelled'|'deferred'|'activated-existing';
export interface OpenOutcome{name:string;studioId?:StudioId;status:OpenOutcomeStatus;reason?:string;preview?:boolean;ordinal?:number;requestId?:string;/** Committed document key (opened only). */key?:string}
export interface OpenReport{generation:number;superseded:boolean;cancelled:boolean;outcomes:OpenOutcome[];focused:OpenOutcome|null;summary:string}
export interface BatchOptions extends ResolveOptions{intent?:OpenIntent}
type Ready=Extract<OpenResolution,{status:'ready'}>;
type Planned={index:number;input:OpenInput;p:PreparedOpen;out:OpenOutcome;resolution:Ready};
export function createOpenCoordinator(deps:OpenDeps){
 let generation=0;
 // D3: the diagnostics host waits for any in-flight destructive approval before opening a surface.
 let approvalsInFlight=0;
 const approvalWaiters:(()=>void)[]=[];
 const approvalBegin=()=>{approvalsInFlight++;};
 const approvalEnd=()=>{approvalsInFlight--;if(approvalsInFlight===0){const w=approvalWaiters.splice(0);for(const f of w)f();}};
 const whenDestructiveApprovalIdle=():Promise<void>=>approvalsInFlight===0?Promise.resolve():new Promise(r=>{approvalWaiters.push(r);});
 const label=(id:StudioId)=>id.charAt(0).toUpperCase()+id.slice(1);
 async function openFiles(inputs:readonly OpenInput[],opts:BatchOptions={}):Promise<OpenReport>{
  let gen=++generation;const intent=opts.intent??'open';
  const requestId=inputs.find(i=>i.requestId!==undefined)?.requestId;
  /** Outcomes live in input-position slots: identity is the position, never the (possibly duplicate) basename. */
  const slots:(OpenOutcome|undefined)[]=new Array(inputs.length).fill(undefined);
  const tag=(i:number,o:OpenOutcome):OpenOutcome=>{const inp=inputs[i];return{...o,...(inp.ordinal!==undefined?{ordinal:inp.ordinal}:{}),...(inp.requestId!==undefined?{requestId:inp.requestId}:{})};};
  const setSlot=(i:number,o:OpenOutcome)=>{slots[i]=tag(i,o);return slots[i]!;};
  const stale=()=>gen!==generation;
  const outcomes=():OpenOutcome[]=>slots.filter((o):o is OpenOutcome=>o!==undefined);
  const report=(over:Partial<OpenReport>,summary:string):OpenReport=>({generation:gen,superseded:false,cancelled:false,outcomes:outcomes(),focused:null,summary,...over});
  const cancelAll=(text:string,r:'cancelled'):OpenReport=>{
   inputs.forEach((_,i)=>setSlot(i,{name:inputs[i].name,status:r,reason:text}));
   return report({cancelled:true},text);};
  const existing:{index:number;studioId:StudioId;key:string}[]=[];
  // 1. Resolve (pure). Non-ready inputs become outcomes immediately.
  const ready:{index:number;input:OpenInput;resolution:Ready}[]=[];
  inputs.forEach((input,index)=>{
   const resolution=resolveOpen(input.name,input.bytes,{...opts,preferred:opts.preferred??deps.preferred?.(input)});
   if(resolution.status!=='ready'&&resolution.status!=='safe-text-offer'){setSlot(index,{name:input.name,status:resolution.status,reason:resolution.reason});return;}
   if(resolution.status==='safe-text-offer'){setSlot(index,{name:input.name,status:'safe-text-offer',studioId:resolution.handler.studioId,reason:resolution.reason});return;}
   const open=input.identityToken!==undefined?deps.findOpenDocument?.(input.identityToken):undefined;
   if(open){setSlot(index,{name:input.name,status:'activated-existing',studioId:open.studioId});existing.push({index,...open});return;}
   ready.push({index,input,resolution});
  });
  let planned:Planned[]=[];let plan:OpenPlan|null=null;
  const disposeAll=()=>{for(const x of planned)x.p.dispose();planned=[];};
  /** 2-4. Prepare every ready item (no session mutation), apply the single-document rule, build the plan. */
  async function buildPlan():Promise<'ok'|'stale'>{
   planned=[];
   for(const r of ready){
    try{
     const p=await deps.prepare(r.input,r.resolution);
     if(stale()){p.dispose();disposeAll();return'stale';}
     planned.push({index:r.index,input:r.input,p,resolution:r.resolution,out:tag(r.index,{name:r.input.name,status:'opened',studioId:p.studioId,preview:r.resolution.preview})});
    }catch(error){
     if(stale()){disposeAll();return'stale';}
     setSlot(r.index,{name:r.input.name,status:'failed',reason:error instanceof Error?error.message:String(error)});
    }
   }
   if(deps.singleDocument){
    const taken=new Set<StudioId>();const keep:Planned[]=[];
    for(const x of planned){
     if(deps.singleDocument(x.p.studioId)){
      if(taken.has(x.p.studioId)){x.p.dispose();setSlot(x.index,{name:x.input.name,status:'deferred',studioId:x.p.studioId,reason:'single-doc-studio'});continue;}
      taken.add(x.p.studioId);}
     keep.push(x);}
    planned=keep;
   }
   const affected:AffectedDoc[]=[];const keys=new Set<string>();
   for(const x of planned)for(const a of x.p.affectedDocs())if(!keys.has(a.key)){keys.add(a.key);affected.push(a);}
   plan={generation:gen,requestId,items:planned.map(x=>({input:x.input,prepared:x.p})),affected,revisionTokens:collectTokens(affected)};
   return'ok';
  }
  const gestureBlocked=()=>planned.length>0&&routesShell(intent)&&!!deps.pendingGesture?.();
  const gestureText='Finish the current edit before opening another file.';
  // Plan, approve, revalidate. One automatic re-plan when the world changed; a second change aborts (never commit on stale plans).
  for(let round=0;round<2&&planned.length+ready.length>0;round++){
   if(round===1){gen=++generation;}
   if(await buildPlan()==='stale')return report({superseded:true},'');
   if(!planned.length)break;
   if(gestureBlocked()){disposeAll();deps.notify(gestureText);return cancelAll(gestureText,'cancelled');}
   let verdict:'approved'|'cancelled';
   approvalBegin();
   try{verdict=await deps.approve(plan!);}
   catch(error){verdict='cancelled';try{deps.approvalFailed?.(requestId,error);}catch{/* logging must never break the fail-closed path */}}
   finally{approvalEnd();}
   if(stale()){disposeAll();return report({superseded:true},'');}
   if(verdict!=='approved'){disposeAll();return cancelAll('Cancelled.','cancelled');}
   if(gestureBlocked()){disposeAll();deps.notify(gestureText);return cancelAll(gestureText,'cancelled');}
   if(deps.revalidate(plan!))break;
   disposeAll();
   if(round===1){const text='The documents changed while waiting. Nothing was opened.';
    for(const r of ready)setSlot(r.index,{name:r.input.name,status:'cancelled',reason:'superseded'});
    deps.notify(text);return report({superseded:true},text);}
   // round 0 failed: loop re-plans once
   for(const r of ready)slots[r.index]=undefined;
  }
  if(stale()){disposeAll();return report({superseded:true},'');}
  // 8. Commit item by item (sync). A failing item does not undo the ones already committed.
  let focused:OpenOutcome|null=null;let focusKey='';
  for(const x of planned){
   const r=x.p.commit();
   if(!r.ok){x.p.dispose();setSlot(x.index,{name:x.input.name,status:'failed',reason:r.error});continue;}
   const out=setSlot(x.index,{...x.out,key:r.key});
   if(!focused&&routesShell(intent)){focused=out;focusKey=r.key;x.p.focus(r.key);}
  }
  planned=[];
  if(focused)deps.switchStudio(focused.studioId!,focusKey);
  else if(routesShell(intent)&&existing.length)deps.switchStudio(existing[0].studioId,existing[0].key);
  const all=outcomes();
  const opened=all.filter(o=>o.status==='opened');const bad=all.filter(o=>o.status!=='opened'&&o.status!=='activated-existing');
  const activated=all.length-opened.length-bad.length;
  let summary:string;
  if(inputs.length===1){
   summary=opened[0]?`Opened ${opened[0].name} in ${label(opened[0].studioId!)}${opened[0].preview?' (read-only preview)':''}.`
    :all[0]?.status==='activated-existing'?`${all[0].name} is already open.`:`Could not open ${all[0]?.name}: ${all[0]?.reason??'unknown error'}`;
  }else summary=`Opened ${opened.length} file${opened.length===1?'':'s'}.${activated?` ${activated} already open.`:''}${bad.length?` ${bad.length} could not be opened: ${bad.slice(0,3).map(o=>`${o.name} (${o.reason})`).join('; ')}${bad.length>3?` and ${bad.length-3} more`:''}`:''}`;
  deps.notify(summary);
  return report({focused},summary);
 }
 return{openFiles,generation:()=>generation,whenDestructiveApprovalIdle};
}
