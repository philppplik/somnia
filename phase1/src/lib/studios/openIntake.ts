import {prepareMediaFile} from '../media';
import {commitTextFiles,installOpenIncoming,type IncomingFile} from '../projectActions';
import {decodeFileBytes} from '../textEncoding';
import {getState,openFileTab,patchState,requestStudio} from '../../store/appStore';
import {setActiveMedia,findMedia} from '../media';
import {createOpenCoordinator,type OpenDeps,type OpenInput,type PreparedOpen,type OpenReport,type BatchOptions,type AffectedDoc,type OpenPlan} from './openCoordinator';
import {currentToken,objectRevision,registerRevisionSource,tokensCurrent} from './revisionTokens';
import {MAX_OPEN_TEXT_BYTES} from './openResolver';
import './openHandlers';
import {importSvg} from '../vectorio';
import {openSvgSource,getVectorSession} from '../vectorstudio/session';
/**
 * App wiring of the Smart Open coordinator: the single entry for EXPLICIT Open (Project > Open file, starter Open buttons, global drop,
 * native dropped copies). Not used by: Video "add source", canvas Place image, chat/convert drops (import / attach), folder media
 * (background), blank-project creation (create). Those keep their own destination.
 */
/**
 * Async confirmation used for the destructive-open approval.
 * R1 (merge note): the 12.0.0 `confirmAction` signature has not landed in the repo yet. This is the ONLY place that depends on it:
 * when 12.0.0 merges, replace `ConfirmAction` by the real type and call `installConfirmAction(confirmAction)` from the app bootstrap
 * (or delete the indirection and import it directly in `appDeps.approve`). Until one is installed approval fails closed (cancelled).
 */
export interface ConfirmRequest{title:string;message:string;confirmLabel?:string;cancelLabel?:string;destructive?:boolean}
export type ConfirmAction=(request:ConfirmRequest)=>Promise<boolean>;
let confirmAction:ConfirmAction|null=null;
export const installConfirmAction=(fn:ConfirmAction|null)=>{confirmAction=fn;};
/** Sink for the single SOM-UI-006 event emitted when approval itself failed (throw). Installed by the diagnostics integrator (D1 logEvent). */
type ApprovalFailureSink=(requestId:string|undefined,error:unknown)=>void;
let approvalFailureSink:ApprovalFailureSink=()=>{};
export const installApprovalFailureSink=(fn:ApprovalFailureSink)=>{approvalFailureSink=fn;};
/** Revision scopes of the stores an open can touch. */
export const SCOPE_TEXT='text-project',SCOPE_VECTOR='vector-document';
registerRevisionSource(SCOPE_TEXT,()=>`${getState().coreConnected?1:0}:${getState().revision}`);
registerRevisionSource(SCOPE_VECTOR,()=>{const v=getVectorSession();return`${v.open?1:0}:${objectRevision(v.doc)}:${v.dirty?1:0}:${v.name}`;});
/** Documents already opened through native intake, by host identity token (renderer half of the same-file rule). */
const openDocuments=new Map<string,{studioId:string;key:string}>();
export const registerOpenDocument=(identityToken:string,doc:{studioId:string;key:string})=>{openDocuments.set(identityToken,doc);};
export const forgetOpenDocument=(identityToken:string)=>{openDocuments.delete(identityToken);};
const documentIsOpen=(d:{studioId:string;key:string})=>d.key.startsWith('media:')?!!findMedia(d.key.slice(6)):d.studioId==='vector'?getVectorSession().open:d.key in getState().files;
/** Studios that hold one document only; extra files for them are deferred, not silently replaced. */
const SINGLE_DOCUMENT_STUDIOS=new Set(['vector']);
const textAffected=():AffectedDoc[]=>{const s=getState();
 // Additive: new files are created in the open project (or a new in-memory project) - nothing is overwritten, so never dirty. The token still invalidates the plan when the project changes during approval.
 return[{key:'text:'+(s.coreConnected?'project':'none'),studioId:'code',dirty:false,token:currentToken(SCOPE_TEXT)}];};
const vectorAffected=():AffectedDoc[]=>{const v=getVectorSession();
 return[{key:'vector:'+v.name,studioId:'vector',dirty:v.open&&v.dirty,token:currentToken(SCOPE_VECTOR)}];};
const approvalText=(dirty:AffectedDoc[])=>`Opening replaces unsaved changes in: ${dirty.map(d=>d.key.replace(/^[a-z-]+:/,'')).join(', ')}. Continue?`;
export const TEXT_KINDS=new Set(['text','svg']);
const textEncoder=new TextEncoder();
async function bytesOf(f:IncomingFile):Promise<Uint8Array>{return f.blob?new Uint8Array(await f.blob.arrayBuffer()):textEncoder.encode(f.text);}
export const appDeps:OpenDeps={
 async prepare(input,resolution):Promise<PreparedOpen>{
  const studioId=resolution.handler.studioId;
  if(TEXT_KINDS.has(resolution.kind)){
   if(input.bytes.length>MAX_OPEN_TEXT_BYTES)throw new Error('larger than 2 MB');
   const text=decodeFileBytes(input.name,input.bytes).text;let added:string[]=[];let live=true;
   // Vector rule: only SVG the strict importer accepts goes to Vector Studio. Anything else stays source in Code (never silently dropped).
   let target=studioId;
   if(studioId==='vector'){try{importSvg(text,{strict:true});}catch{target='code';}}
   if(target==='vector')return{name:input.name,studioId:target,affectedDocs:vectorAffected,dispose(){live=false;},
    commit(){if(!live)return{ok:false,error:'cancelled'};if(!openSvgSource(text,input.name,{strict:true}))return{ok:false,error:'Vector Studio kept the current document.'};added=commitTextFiles([{name:input.name,text}],{activate:false});return{ok:true,key:added[0]};},
    focus(key){openFileTab(key);}};
   return{name:input.name,studioId:target,affectedDocs:textAffected,dispose(){live=false;},
    commit(){if(!live)return{ok:false,error:'cancelled'};added=commitTextFiles([{name:input.name,text}],{activate:false});return{ok:true,key:added[0]};},
    focus(key){openFileTab(key);}};
  }
  const prepared=await prepareMediaFile(new Blob([input.bytes as BlobPart]),input.name);
  if('error' in prepared)throw new Error(prepared.error);
  return{name:input.name,studioId,affectedDocs:()=>[],dispose:prepared.dispose,
   commit(){const r=prepared.commit({activate:false});return'error' in r?{ok:false,error:r.error}:{ok:true,key:'media:'+r.name};},
   focus(key){setActiveMedia(key.slice('media:'.length));}};
 },
 async approve(plan:OpenPlan){
  const dirty=plan.affected.filter(a=>a.dirty);
  if(!dirty.length)return'approved';
  if(!confirmAction)throw new Error('confirmAction is not installed');
  return(await confirmAction({title:'Replace unsaved changes?',message:approvalText(dirty),confirmLabel:'Replace',destructive:true}))?'approved':'cancelled';
 },
 revalidate:plan=>tokensCurrent(plan.revisionTokens),
 singleDocument:id=>SINGLE_DOCUMENT_STUDIOS.has(id),
 findOpenDocument:token=>{const d=openDocuments.get(token);if(!d)return undefined;if(!documentIsOpen(d)){openDocuments.delete(token);return undefined;}return d;},
 approvalFailed:(id,error)=>approvalFailureSink(id,error),
 switchStudio(studioId,key){requestStudio(studioId,'open',false,key);},
 notify(text){patchState({notice:text});},
 preferred:input=>getState().studioByTab[input.key??input.name]
};
export const coordinator=createOpenCoordinator(appDeps);
/** Native intake adds host correlation; plain files (drop, picker) leave it out. */
export interface IntakeFile extends IncomingFile{requestId?:string;ordinal?:number;identityToken?:string}
export async function openIncoming(files:IntakeFile[],opts:BatchOptions={}):Promise<OpenReport>{
 const inputs:OpenInput[]=[];
 for(const f of files)inputs.push({name:f.name,bytes:await bytesOf(f),...(f.requestId!==undefined?{requestId:f.requestId}:{}),...(f.ordinal!==undefined?{ordinal:f.ordinal}:{}),...(f.identityToken!==undefined?{identityToken:f.identityToken}:{})});
 const report=await coordinator.openFiles(inputs,opts);
 for(const o of report.outcomes){const f=o.ordinal===undefined?undefined:inputs.find(i=>i.ordinal===o.ordinal);if(o.status==='opened'&&o.key&&o.studioId&&f?.identityToken)registerOpenDocument(f.identityToken,{studioId:o.studioId,key:o.key});}
 return report;
}
installOpenIncoming(files=>openIncoming(files));
