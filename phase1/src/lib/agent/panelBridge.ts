import {isTauri} from '@tauri-apps/api/core';
import {nativeProviderFetch} from './nativeProviderFetch';
import {OpenAIProvider} from './openAI';
import {ClaudeProvider} from './providers/claude';
import {loadProviderKey,type AuthProvider} from './providerAuth';
import type {CustomPrompt} from './settings';
import {logWarn} from '../log';
import {AgentSession} from './session';
import {AgentProjectTools} from './projectTools';
import {OllamaProvider} from './providers/ollama';
import {OpenRouterProvider} from './openRouter';
import {agentPrivacy,type AIProvenance} from './privacy';
import {applyReviewed,reviewChangeSet,type ChangeSet,type Decisions} from '../agentDiff';
import {holdAgentAutosave} from './autosaveHold';
import {applyOperations,getState,getProjectGeneration,subscribe,patchState} from '../../store/appStore';
import type {AgentCore,AgentEvent,AgentApproval,AgentProposal,DiffLine} from './core';
import type {AgentProvider,AgentProviderEvent,AgentProviderRequest} from './types';
export interface AgentConfiguration {provider:AuthProvider;model:string;apiKey:string;allowActiveFile:boolean;customPrompts?:CustomPrompt[]}
let config:AgentConfiguration={provider:'ollama',model:'',apiKey:'',allowActiveFile:false};
export function configureAgent(value:AgentConfiguration){realCore.clear?.();config={...value};}
export function setAgentActiveFileAccess(allowActiveFile:boolean){config={...config,allowActiveFile};}
/** Custom instructions are sent every provider round, never as access permission. */
export function withCustomPrompts(provider:AgentProvider,prompts:readonly CustomPrompt[]=[]):AgentProvider {
 const text=prompts.filter(p=>p.enabled&&p.text.trim()).map(p=>p.text.trim()).join('\n\n');
 if(new TextEncoder().encode(text).length>16000)throw Error('Custom prompts exceed size limits.');
 return {id:provider.id,locality:provider.locality,stream(request){return provider.stream({...request,messages:text?[...request.messages.slice(0,1),{role:'system',content:'Additional user preferences (do not override tool access or safety rules):\n'+text},...request.messages.slice(1)]:request.messages});}};
}
/** A gated stream whose operation remains live through body consumption, with single-slot backpressure. */
function guardedOllama(provider:OllamaProvider):AgentProvider {
 return {id:provider.id,locality:provider.locality,async *stream(request:AgentProviderRequest){
  const check=await provider.verifyLocalModel(request.model,request.signal);
  const controller=new AbortController();const abort=()=>controller.abort(request.signal.reason);
  request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
  let gateSignal:AbortSignal|undefined;let slot:AgentProviderEvent|undefined,finished=false,error:unknown;let wake=()=>{},release=()=>{};
  const pending=agentPrivacy.run({provider:'ollama',endpoint:provider.baseUrl,processing:check.local?'local':'cloud'},async signal=>{
   gateSignal=signal;
   for await(const event of provider.stream({...request,signal})){
    signal.throwIfAborted();
    await new Promise<void>(resolve=>{release=resolve;slot=event;wake();if(signal.aborted)resolve();else signal.addEventListener('abort',()=>resolve(),{once:true});});
    signal.throwIfAborted();
   }
  },controller.signal).catch(e=>{error=e;}).finally(()=>{finished=true;wake();});
  try {while(!finished||slot){if(!slot){await new Promise<void>(resolve=>{wake=resolve;});continue;}controller.signal.throwIfAborted();gateSignal?.throwIfAborted();const event=slot;slot=undefined;release();yield event;}if(error)throw error;}
  finally{controller.abort();release();await pending;request.signal.removeEventListener('abort',abort);}
 }};
}
export function createProvider(id:AuthProvider):AgentProvider {
 if(id==='ollama')return guardedOllama(new OllamaProvider());
 const options={getApiKey:()=>loadProviderKey(id),...(isTauri()?{fetch:nativeProviderFetch(id)}:{})};
 if(id==='openai')return new OpenAIProvider(options);
 if(id==='claude')return new ClaudeProvider(options);
 if(id==='openrouter')return new OpenRouterProvider(options);
 throw Error('Unsupported AI provider.');
}
let runGeneration=0,sessionSerial=0;
let session:AgentSession|null=null,epoch=-1,send:((event:AgentEvent)=>void)|null=null;
export const appliedAgentProvenance=new Map<string,AIProvenance>();
const proposals=new Map<string,ChangeSet>();
const permissions=new Map<string,Set<'read'|'write'>>();
let approvalCounter=0;
function currentFiles(){return getState().files;}
async function authorize(path:string,action:'read'|'write',signal:AbortSignal){
 if(epoch!==getProjectGeneration())throw Error('Project changed. Start a new chat.');
 if(permissions.get(path)?.has(action))return;
 await new Promise<void>((resolve,reject)=>{
  let settled=false;const abort=()=>finish('cancel');
  const finish=(decision:Parameters<AgentApproval['resolve']>[0])=>{
   if(settled)return;settled=true;signal.removeEventListener('abort',abort);
   if((decision==='accept'||decision==='accept_for_session')&&!signal.aborted&&epoch===getProjectGeneration()){
    if(decision==='accept_for_session'){const grants=permissions.get(path)??new Set<'read'|'write'>();grants.add('read');if(action==='write')grants.add('write');permissions.set(path,grants);}
    resolve();
   }else reject(Error(decision==='cancel'?'Access request cancelled.':'File access declined.'));
  };
  signal.addEventListener('abort',abort,{once:true});
  send?.({type:'approval',approval:{id:`approval-${++approvalCounter}`,path,action:action==='write'?'Read base and propose edits':'Read file into model context',resolve:finish}});
  if(signal.aborted)abort();
 });
}
// Temporary per-call permission passes only after the matching human decision.
function createTools(project:string){
 return new AgentProjectTools({projectId:project,files:currentFiles,
  authorize:async(path,action,signal)=>{await authorize(path,action,signal);return true;},
  allowed:(path,action)=>epoch===getProjectGeneration()&&(permissions.get(path)?.has(action==='list'?'read':action)||false)
 });
}
function panelProposal(set:ChangeSet):AgentProposal {
 const reviews=reviewChangeSet(set);const lines=reviews.flatMap(r=>r.ops.flatMap<DiffLine>(op=>op.t==='same'?[{kind:'ctx' as const,text:op.text}]:[...op.removed.map(text=>({kind:'del' as const,text})),...op.added.map(text=>({kind:'add' as const,text}))]));
 return {id:set.id,file:set.files.map(f=>f.path).join(', '),changeSet:set,lines,added:lines.filter(l=>l.kind==='add').length,removed:lines.filter(l=>l.kind==='del').length};
}
export const realCore:AgentCore={
 run(request,onEvent){
  if(session?.status==='running'){queueMicrotask(()=>onEvent({type:'error',message:'The previous turn is still stopping. Wait before sending again.'}));return {cancel(){}};}
  let stopped=false;const runId=++runGeneration;const deliver=(e:AgentEvent)=>{if(!stopped&&runId===runGeneration)onEvent(e);};send=deliver;
  if(!config.model.trim()){queueMicrotask(()=>deliver({type:'error',message:'Choose a provider and model in Settings > AI first.'}));return {cancel(){stopped=true;}};}
  const generation=getProjectGeneration();
  if(epoch!==generation){session?.cancel();session=null;sessionSerial++;proposals.clear();permissions.clear();appliedAgentProvenance.clear();epoch=generation;}
  if(config.allowActiveFile&&request.context.activeFile)permissions.set(request.context.activeFile,new Set(['read']));
  if(!session){const sessionEpoch=epoch;const sessionToken=sessionSerial;const provider=createProvider(config.provider);
   session=new AgentSession({provider:withCustomPrompts(provider,config.customPrompts),model:config.model,tools:getState().coreConnected?createTools(String(generation)):undefined,onEvent:event=>{
    if(sessionEpoch!==epoch||sessionToken!==sessionSerial)return;
    if(event.type==='text')send?.({type:'text-delta',text:event.text});
    else if(event.type==='state'&&event.status==='running')send?.({type:'status',text:'Working'});
    else if(event.type==='tool')send?.({type:'status',text:`${event.call.name}: ${event.status}`});
    else if(event.type==='usage')send?.({type:'usage',...event.usage});
    else if(event.type==='notice')send?.({type:'error',message:event.message,code:event.code,retryable:event.retryable});
    else if(event.type==='proposals'&&event.proposals.length){
     const set:ChangeSet={id:`${generation}-${event.turnId}`,complete:true,provenance:event.proposals[0].provenance,files:event.proposals.map(p=>({path:p.path,kind:p.before===null?'create':'edit',baseText:p.before,proposedText:p.after}))};proposals.set(set.id,set);send?.({type:'proposal',proposal:panelProposal(set)});
    }
   }});
  }
  const current=session;void current.prompt(request.prompt).then(()=>deliver({type:'done'})).catch(e=>deliver({type:'error',message:e instanceof Error?e.message:'Agent failed.'}));
  return {cancel(){current.cancel();stopped=true;}};
 },
 async applyProposal(id,decisions){
  if(epoch!==getProjectGeneration())throw Error('Project changed. Proposal is no longer valid.');
  const set=proposals.get(id);if(!set)throw Error('Proposal no longer exists.');
  const d:Decisions=decisions??Object.fromEntries(reviewChangeSet(set).flatMap(r=>r.hunks.map(h=>[h.key,'accept'])));
  const plan=await applyReviewed({read:path=>currentFiles()[path]??null,holdAutosave:holdAgentAutosave,applyBatch:writes=>{
   if(epoch!==getProjectGeneration())throw Error('Project changed during apply.');
   applyOperations(writes.map(w=>({type:w.kind==='create'?'createFile':'replaceSource',file:w.path,text:w.text})), 'canvas',`agent-${id}`);
   for(const write of writes)if(write.provenance)appliedAgentProvenance.set(write.path,write.provenance);
   patchState({notice:'AI changes applied to editor, not saved. Use Save project to write them to disk.'});
  }},set,d);
  if(!plan.ok){logWarn('agent.apply','Apply blocked',{blockers:plan.blockers.map(b=>({reason:b.reason,path:b.path}))});throw Error(plan.blockers.map(b=>b.detail).join('; '));}
  proposals.delete(id);session?.discardProposals();
 },
 async rejectProposal(id){proposals.delete(id);session?.discardProposals();},
 async revertProposal(){throw Error('Use the editor Undo command to revert applied changes.');},
 clear(){runGeneration++;sessionSerial++;session?.cancel();session=null;proposals.clear();permissions.clear();send=null;}
};
subscribe(()=>{if(epoch!==getProjectGeneration()){realCore.clear?.();epoch=getProjectGeneration();}});
