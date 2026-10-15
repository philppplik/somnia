import {localErrorHelp} from '../../lib/agent/localErrorHelp';
import {documentReviewHistory,subscribeReviewHistory,recordReviewDecision} from '../../lib/agent/documentReviewHistory';
import {studioPromptChips} from '../../lib/agent/studioPromptChips';
import {panelDocumentLabel,loadedLocalModels} from '../../lib/agent/panelStatus';
import {LocalModelsRuntime} from '../../lib/agent/localModels';
import {useDocuments} from '../../lib/documents/store';
import {useSheetsSelection} from '../../lib/sheets/sheetsStore';
import {getSlidesSessionState,subscribeSlides} from '../../lib/slides/session';
import {activeAgentDocumentRef} from '../../lib/agent/panelBridge';
import {effectiveLocalChoice} from '../../lib/agent/localAssistant';
import {panelPreferencesSnapshot,subscribePanelPreferences,setPanelPreferences,panelDisclosureKey,consumePanelDisclosure} from '../../lib/agent/panelPreferences';
import {getProjectGeneration} from '../../store/appStore';
import {publishLocalContextBudget} from '../../lib/agent/localContextBudgetStore';
import {StudioStatus} from '../studios/StudioStatus';
import {buildAgentStudioContext,hasAgentContextAdapter} from '../../lib/agent/studioContextAdapter';
import {getStudio} from '../../lib/studios';
import {useUiContext,getUiContext} from '../../lib/uiContextStore';
import {useMedia,getMedia} from '../../lib/media';
import {studioAgentContext} from '../../lib/agent/studioContext';
import {activeStudioDocument} from '../../lib/agent/studioTarget';
import {reportError} from '../../lib/log';
import {useCallback,useEffect,useReducer,useRef,useState,useSyncExternalStore} from 'react';
import {LoaderCircle,PanelRightClose,Send,Settings,Square,SquarePen} from '../../lib/icons';
import {createStreamSink} from '../../lib/agent/streaming';
import {chatReducer,initialChat,type ChatItem} from '../../lib/agent/chat';
import {getAgentCore,type AgentProposal,type AgentRun,type ApprovalDecision,type AgentApproval} from '../../lib/agent/core';
import {agentSettingsSnapshot,subscribeAgentSettings,initializeAgentSettings,setAgentActivity} from '../../lib/agent/settingsRuntime';
import {getState,patchState} from '../../store/appStore';
import {useT} from '../../lib/useT';
import {NativeProposalReview} from './NativeProposalReview';
import {useAppStore} from '../../store/appStore';
import {AgentReview} from '../AgentReview';
import type {Decisions} from '../../lib/agentDiff';
import {AIGeneratedLabel} from './AgentPrivacy';

import {NativeButton,NativeInput} from '../ui/native-controls';
export function AgentPanel(){
 const media=useMedia();const app=useAppStore();const target=activeStudioDocument(app,media);const studio=studioAgentContext(app.activeStudio,target.path,app.editorKind);
 const docState=useDocuments(),sheetSelection=useSheetsSelection(),slideState=useSyncExternalStore(subscribeSlides,getSlidesSessionState,getSlidesSessionState);const displayDocument=panelDocumentLabel(target,app.activeStudio,{documents:docState.name,sheets:sheetSelection?.file,slides:slideState.name},media.items.map(m=>m.name));
 const ui=useUiContext();const definition=getStudio(app.activeStudio);const adapted=hasAgentContextAdapter(definition)&&!(definition.id==='code'&&(target.media||['raster','vector','pdf'].includes(ui.domain)));
 const agentContext=adapted?buildAgentStudioContext(definition,target,ui,app.viewMode):undefined;
 const {t}=useT();const [chat,dispatch]=useReducer(chatReducer,initialChat);const prefs=useSyncExternalStore(subscribePanelPreferences,panelPreferencesSnapshot,panelPreferencesSnapshot);const draft=prefs.draft;const setDraft=(draft:string)=>setPanelPreferences({draft});
 const historyKey=JSON.stringify([getProjectGeneration(),displayDocument??'']);const reviewHistory=useSyncExternalStore(subscribeReviewHistory,()=>documentReviewHistory(historyKey),()=>documentReviewHistory(historyKey));const proposalHistoryKeys=useRef(new Map<string,string>());
 const recordDecision=(p:AgentProposal,state:'accepted'|'rejected'|'undone')=>recordReviewDecision(proposalHistoryKeys.current.get(p.id)??JSON.stringify([getProjectGeneration(),p.file]),{id:p.id,file:p.file,summary:p.textEdit?.label??p.sheets?.address??'Reviewed proposal',state,decidedAt:Date.now()});
 const nativeMode=prefs.nativeMode;
 const task=prefs.task;const localChoices=prefs.choices;
 const settings=useSyncExternalStore(subscribeAgentSettings,agentSettingsSnapshot,agentSettingsSnapshot);
 const selectedTaskModel=settings.config.localRuntime?.taskModels?.[task];const effectiveProvider=selectedTaskModel?'ollama':settings.config.provider;const effectiveModel=effectiveLocalChoice(settings.config,task,localChoices.studio?agentContext?.studioId:undefined).model;
 const [loadedModels,setLoadedModels]=useState<string[]|null>(null);useEffect(()=>{let live=true;setLoadedModels(null);if(effectiveProvider==='ollama')void new LocalModelsRuntime().running().then(raw=>{if(live)setLoadedModels(loadedLocalModels(raw));}).catch(()=>{if(live)setLoadedModels(null);});return()=>{live=false;};},[effectiveProvider,effectiveModel,settings.revision,chat.busy]);
 const {ready:settingsReady,saving,authBusy,error:settingsError}=settings;
 useEffect(()=>{publishLocalContextBudget(null);},[draft,settings.revision,task,target.path,app.activeStudio,localChoices]);
 useEffect(()=>{void initializeAgentSettings();},[]);
 const openSettings=()=>patchState({settingsOpen:true,settingsSection:'AI',settingsAITab:'providers',settingsNavigationId:getState().settingsNavigationId+1});
 const requestGeneration=useRef(0);const stream=useRef<ReturnType<typeof createStreamSink>|null>(null);
 const run=useRef<AgentRun|null>(null);const scroller=useRef<HTMLDivElement>(null);const input=useRef<HTMLInputElement>(null);const pinned=useRef(true);
 const [announce,setAnnounce]=useState('');
 const [mcpProposals,setMcpProposals]=useState<AgentProposal[]>([]);
 useEffect(()=>{let off:(()=>void)|undefined;let dead=false;
  void import('../../lib/agent/panelBridge').then(m=>{if(dead)return;off=m.subscribeMcpProposalList(()=>setMcpProposals(m.mcpProposalSnapshot()));setMcpProposals(m.mcpProposalSnapshot());});
  return()=>{dead=true;off?.();};},[]);
 useEffect(()=>{requestGeneration.current++;stream.current?.close();run.current?.cancel();run.current=null;},[settings.revision]);
 useEffect(()=>()=>{publishLocalContextBudget(null);requestGeneration.current++;stream.current?.close();run.current?.cancel();setAgentActivity(false,false);},[]);
 useEffect(()=>{const el=scroller.current;if(el&&pinned.current)el.scrollTop=el.scrollHeight;},[chat.items]);
 useEffect(()=>{const last=chat.items.at(-1);setAnnounce(chat.busy?t('agent.input.busy'):last?.kind==='error'?last.text:last?.kind==='diff'&&last.state==='pending'?`Proposal ready for ${last.proposal.file}. Review before accepting.`:last?.kind==='diff'?`Proposal ${last.state} for ${last.proposal.file}.`:last?.kind==='stopped'?'Generation stopped.':chat.items.length?t('agent.status.done'):'');},[chat.busy,chat.items,t]);
 const send=useCallback((raw:string)=>{
  const text=raw.trim();if(nativeMode&&effectiveProvider!=='ollama')return;if(!text||chat.busy||!settingsReady||saving||authBusy)return;
  const disclosureKey=panelDisclosureKey({project:getProjectGeneration(),revision:app.revision,settingsRevision:settings.revision,provider:effectiveProvider,model:effectiveModel,path:target.path,media:target.media,studio:app.activeStudio,selection:JSON.stringify({node:app.selectedElementId,ui:ui.selection}),documentRef:JSON.stringify(activeAgentDocumentRef(target.path)),choices:localChoices,task});const approvedDisclosure=consumePanelDisclosure(disclosureKey);
  const pinnedContext=agentContext;const generation=++requestGeneration.current;dispatch({type:'send',text});setDraft('');pinned.current=true;const s=getState();
  publishLocalContextBudget(null);stream.current?.close();const sink=createStreamSink(event=>{if(generation===requestGeneration.current)dispatch({type:'event',event});});stream.current=sink;
  void getAgentCore().then(core=>{if(generation!==requestGeneration.current)return;const current=getState(),currentUi=getUiContext(),currentSettings=agentSettingsSnapshot(),currentTarget=activeStudioDocument(current,getMedia());const currentKey=panelDisclosureKey({project:getProjectGeneration(),revision:current.revision,settingsRevision:currentSettings.revision,provider:effectiveProvider,model:effectiveModel,path:currentTarget.path,media:currentTarget.media,studio:current.activeStudio,selection:JSON.stringify({node:current.selectedElementId,ui:currentUi.selection}),documentRef:JSON.stringify(activeAgentDocumentRef(currentTarget.path)),choices:localChoices,task});run.current=core.run({prompt:text,context:{...(nativeMode?{executionMode:'local-native' as const}:{}),task,...(effectiveProvider==='ollama'?{localContext:localChoices}:{}),activeFile:target.media?'':target.path,activeMedia:target.media?target.path:undefined,selectedElementId:s.selectedElementId,disclosureProvider:approvedDisclosure&&disclosureKey===currentKey?effectiveProvider:undefined,studio:pinnedContext}},event=>{if(generation===requestGeneration.current){if(event.type==='proposal')proposalHistoryKeys.current.set(event.proposal.id,JSON.stringify([getProjectGeneration(),event.proposal.file]));sink.receive(event);}});}).catch(e=>{if(generation!==requestGeneration.current)return;reportError('agent.start',e,{message:'Agent could not start'});sink.receive({type:'error',message:'Agent could not start. Check your configuration and try again.',retryable:true});});
 },[chat.busy,settingsReady,saving,authBusy,target.path,target.media,agentContext,task,localChoices,effectiveProvider,effectiveModel,nativeMode,app.revision,app.selectedElementId,app.activeStudio,settings.revision,ui.selection]);
 const stop=()=>{publishLocalContextBudget(null);stream.current?.close(true);requestGeneration.current++;run.current?.cancel();run.current=null;dispatch({type:'stop'});input.current?.focus();};
 const reset=()=>{stop();void getAgentCore().then(c=>c.clear?.());dispatch({type:'reset'});setPanelPreferences({disclosureKey:null});setDraft('');};
 const resolve=async(p:AgentProposal,state:'accepted'|'rejected',decisions?:Decisions)=>{
  const core=await getAgentCore();try{await(state==='accepted'?core.applyProposal(p.id,decisions):core.rejectProposal(p.id));recordDecision(p,state);dispatch({type:'resolve',proposalId:p.id,state});}
  catch(e){reportError('agent.apply',e,{message:`Proposal ${state==='accepted'?'apply':'reject'} failed`,level:'warn'});dispatch({type:'event',event:{type:'error',message:e instanceof Error?e.message:String(e)}});}
 };
 useEffect(()=>{setAgentActivity(chat.busy,chat.items.some(i=>i.kind==='diff'&&i.state==='pending'));},[chat.busy,chat.items]);
 const empty=chat.items.length===0;
 return <aside className="ag-panel" aria-label={t('agent.title')} onKeyDown={e=>{if(e.key!=='Escape'||e.defaultPrevented||chat.busy)return;const pending=chat.items.filter(i=>i.kind==='diff'&&i.state==='pending');if(pending.length!==1)return;const item=pending[0];if(item.kind!=='diff')return;e.preventDefault();if(window.confirm('Reject the pending proposal for '+item.proposal.file+'? Nothing will be applied.'))void resolve(item.proposal,'rejected').then(()=>input.current?.focus());}}>
  <header className="ag-hd">
   <NativeButton type="button" className="ag-ib ag-hd-left" title={t('agent.newChat')} aria-label={t('agent.newChat')} onClick={reset}><SquarePen size={17}/></NativeButton><h2>{t('agent.title')}</h2>{adapted&&<span className="ag-studio-chip" data-testid="agent-studio-chip" title={agentContext?.selectionSummary}>{agentContext?.label}</span>}
   <div className="ag-hd-right"><NativeButton type="button" className="ag-ib" title="Agent configuration" aria-label="Agent configuration" disabled={chat.busy||!settingsReady||saving||authBusy} onClick={openSettings}><Settings size={17}/></NativeButton><NativeButton type="button" className="ag-ib" title={t('agent.collapse')} aria-label={t('agent.collapse')} onClick={()=>patchState({agentOpen:false})}><PanelRightClose size={17}/></NativeButton></div>
  </header>
  <div className="ag-chat" ref={scroller} onScroll={e=>{const el=e.currentTarget;pinned.current=el.scrollHeight-el.scrollTop-el.clientHeight<48;}} role="log" aria-live="off" aria-label={t('agent.title')}>
   <p className="ag-context-chip" role="status" data-testid="agent-context-status">{displayDocument??t('agent.panel.noDocument')} · {effectiveProvider==='ollama'?'Local Ollama':effectiveProvider} · Selected: {effectiveModel||t('local.unknown')}{effectiveProvider==='ollama'&&<><br/>Ollama loaded (last check): {loadedModels===null?t('local.unknown'):loadedModels.length?loadedModels.join(', '):'None'}</>}{nativeMode&&' · No cloud fallback'}</p>
   {!!reviewHistory.length&&<details className="ag-review-history"><summary>Earlier decisions · {reviewHistory.length}</summary><ul>{reviewHistory.map(e=><li key={e.id}>{e.summary} · {e.state}</li>)}</ul><p>Session-local display only. Previous edits cannot be applied from this list.</p></details>}
   {settingsError&&<StudioStatus tone="error" live="assertive">{settingsError}</StudioStatus>}
   {empty?<div className="ag-empty"><div className="ag-orb" aria-hidden="true"/><h3>{t('agent.empty.title')}</h3><span>{studio.label==='Code'?t('agent.empty.body'):`Describe what you want to do in ${studio.label}. ${studio.scope}.`}</span><p className="ag-tip">{t('agent.panel.tip')}</p><ul className="ag-prompt-chips" aria-label="Draft suggestions">{studioPromptChips(({Docs:'documents',Slides:'slides',Sheets:'sheets',Photos:'photos',Sounds:'sound',Code:'code'} as Record<string,string>)[studio.label]??app.activeStudio).map(text=><li key={text}><NativeButton type="button" className="ag-prompt-chip" onClick={()=>{setDraft(text);input.current?.focus();}}>{text}</NativeButton></li>)}</ul></div>:chat.items.map((item,index)=><Row key={item.id} item={item} local={effectiveProvider==='ollama'} busy={chat.busy} onRetry={()=>{const last=chat.items.slice(0,index).reverse().find(i=>i.kind==='user');if(last&&last.kind==='user')send(last.text);}} onAccept={(p,d)=>void resolve(p,'accepted',d)} onReject={p=>void resolve(p,'rejected')} onUndo={async p=>{try{await(await getAgentCore()).revertProposal(p.id);recordDecision(p,'undone');dispatch({type:'resolve',proposalId:p.id,state:'undone'});}catch(e){dispatch({type:'event',event:{type:'error',message:e instanceof Error?e.message:String(e)}});}}}/>)}
   {mcpProposals.map(p=><div key={p.id} className="ag-review" data-state="pending" data-testid="mcp-proposal"><AIGeneratedLabel provenance={p.changeSet?.provenance}/>{p.sheets?<section className="ag-native-review"><strong>{p.file} · {p.sheets.address}</strong><p>Before: {p.sheets.before}</p><p>After: {p.sheets.after}</p><p>One selected cell. No disk write.</p><NativeButton onClick={()=>void resolve(p,'accepted')}>Accept preview</NativeButton><NativeButton onClick={()=>void resolve(p,'rejected')}>Reject proposal</NativeButton></section>:<NativeProposalReview proposal={p} onAccept={(pr,d)=>void resolve(pr,'accepted',d)} onReject={()=>void resolve(p,'rejected')}/>}</div>)}
  </div>
  <div className="ag-bar" aria-hidden="true"><div className="ag-pb"><i/><i/><i/><i/></div><div className="ag-grad"/></div>
  <div className="ag-inp"><form className="ag-field" onSubmit={e=>{e.preventDefault();if(chat.busy)stop();else send(draft);}}>
   <NativeInput ref={input} value={draft} disabled={chat.busy||!settingsReady||saving||authBusy} onChange={e=>setDraft(e.target.value)} placeholder={chat.busy?t('agent.input.busy'):t('agent.input.placeholder')} aria-label={t('agent.input.label')} autoComplete="off"/>
   {chat.busy?<NativeButton type="submit" className="ag-send ag-stop" title={t('agent.stop')} aria-label={t('agent.stop')}><Square size={14} fill="currentColor"/></NativeButton>:<NativeButton type="submit" className="ag-send" title={t('agent.send')} aria-label={t('agent.send')} disabled={nativeMode&&effectiveProvider!=='ollama'||!draft.trim()||!settingsReady||saving||authBusy}><Send size={17}/></NativeButton>}
  </form></div>
  <span className="sr-only" role="status" aria-live="polite">{announce}</span>
 </aside>;
}
function Approval({approval}:{approval:AgentApproval}){
 const [decision,setDecision]=useState<ApprovalDecision|null>(null);
 return <section className="ag-approval" aria-label="File access approval"><strong>{approval.action}</strong><code>{approval.path}</code><p>File contents may contain private information. Grant only the context you want the selected model to receive.</p>{decision?<p role="status">{decision}</p>:<div>{(['accept','accept_for_session','decline','cancel'] as const).map(d=><NativeButton type="button" key={d} onClick={()=>{setDecision(d);approval.resolve(d);}}>{({accept:'Accept once',accept_for_session:'Accept for session',decline:'Decline',cancel:'Cancel'})[d]}</NativeButton>)}</div>}</section>;
}
function Row({local,item,onAccept,onReject,onRetry,busy,onUndo}:{local:boolean;item:ChatItem;onUndo:(p:AgentProposal)=>void;busy:boolean;onRetry:()=>void;onAccept:(p:AgentProposal,d:Decisions)=>void;onReject:(p:AgentProposal)=>void}){
 switch(item.kind){
  case 'user':return <div className="ag-b ag-u"><p data-copyable>{item.text}</p></div>;
  case 'agent':return <div className="ag-b ag-a"><AIGeneratedLabel/><p data-copyable className="ag-answer" aria-busy={item.streaming}>{item.text}{item.streaming&&<span className="ag-caret" aria-hidden="true"/>}</p>{item.incomplete&&<small className="ag-incomplete">{item.incomplete==='stopped'?'Stopped - partial response':'Interrupted - partial response'}</small>}</div>;
  case 'stopped':return <StudioStatus className="ag-stopped">{item.text}</StudioStatus>;
  case 'status':return <StudioStatus className="ag-status"><LoaderCircle size={17} className="ag-spin"/>{item.text}</StudioStatus>;
  case 'error':return <div className="ag-error" data-copyable><StudioStatus tone="error" live="assertive">{item.text}</StudioStatus>{local&&localErrorHelp(item.detail)&&<p className="ag-error-help" role="note">{localErrorHelp(item.detail)}</p>}{item.retryable&&<NativeButton type="button" className="ag-retry" disabled={busy} onClick={onRetry}>Retry</NativeButton>}</div>;
  case 'usage':return <p className="ag-usage">{item.text}</p>;
  case 'approval':return <Approval approval={item.approval}/>;
  case 'diff':return <div className="ag-review" data-state={item.state}><AIGeneratedLabel provenance={item.proposal.changeSet?.provenance}/>{item.state==='pending'&&item.proposal.rangePreview?<section className="ag-native-review"><strong>{item.proposal.file} · {item.proposal.rangePreview.address}</strong><p>{item.proposal.rangePreview.executeAvailable?(item.proposal.rangePreview.reviewLabel??'Selected range review. One native undo step. No disk write.'):'Multiple-target preview only. Apply and Undo are unavailable until a native atomic receipt exists. Nothing applied or saved.'}</p><pre data-copyable>{item.proposal.rangePreview.before.join('\n')}</pre><pre data-copyable>{item.proposal.rangePreview.values.map(r=>r.join(' | ')).join('\n')}</pre>{item.proposal.rangePreview.executeAvailable&&<NativeButton type="button" onClick={()=>onAccept(item.proposal,{})}>Accept preview</NativeButton>}<NativeButton type="button" onClick={()=>onReject(item.proposal)}>Reject proposal</NativeButton></section>:item.state==='pending'&&item.proposal.textEdit?<section className="ag-native-review"><strong>{item.proposal.file} · {item.proposal.textEdit.label}</strong><p data-copyable>Before: {item.proposal.textEdit.before}</p><p data-copyable>After: {item.proposal.textEdit.after}</p><p>One selected text target. No disk write.</p><NativeButton type="button" onClick={()=>onAccept(item.proposal,{})}>Accept preview</NativeButton><NativeButton type="button" onClick={()=>onReject(item.proposal)}>Reject proposal</NativeButton></section>:item.state==='pending'&&item.proposal.sheets?<section className="ag-native-review"><strong>{item.proposal.file} · {item.proposal.sheets.address}</strong><p data-copyable>Before: {item.proposal.sheets.before}</p><p data-copyable>After: {item.proposal.sheets.after}</p><p>One selected cell. No disk write.</p><NativeButton type="button" onClick={()=>onAccept(item.proposal,{})}>Accept preview</NativeButton><NativeButton type="button" onClick={()=>onReject(item.proposal)}>Reject proposal</NativeButton></section>:item.state==='pending'&&item.proposal.native?<NativeProposalReview proposal={item.proposal} onAccept={onAccept} onReject={()=>onReject(item.proposal)}/>:item.state==='pending'&&item.proposal.changeSet?<AgentReview changeSet={item.proposal.changeSet} readCurrent={p=>getState().files[p]??null} onApply={(_,d)=>onAccept(item.proposal,d)} onDiscard={()=>onReject(item.proposal)}/>:<p>{item.state==='accepted'?item.proposal.photo?'Applied to Photo memory, not saved. Use Save Photo copy as PNG. Original file unchanged.':item.proposal.native?.base.studioKind==='code'?'Applied to editor, not saved. Use Save project to save, or editor Undo to revert.':'Applied to studio memory, not saved. Use the studio save-copy or export action to save.':item.state==='undone'?'AI transaction undone. Nothing saved.':'Proposal discarded.'}</p>}{item.state==='accepted'&&(item.proposal.native||item.proposal.sheets||item.proposal.textEdit||item.proposal.rangePreview?.executeAvailable)&&<NativeButton className="ag-native-undo" type="button" onClick={()=>onUndo(item.proposal)}>Undo AI transaction</NativeButton>}</div>;
 }
}
