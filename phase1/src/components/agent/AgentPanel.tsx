import {useMedia} from '../../lib/media';
import {studioAgentContext} from '../../lib/agent/studioContext';
import {activeStudioDocument} from '../../lib/agent/studioTarget';
import {AgentAccountStatus} from './AgentAccountStatus';
import {reportError} from '../../lib/log';
import {useCallback,useEffect,useReducer,useRef,useState,useSyncExternalStore} from 'react';
import {LoaderCircle,PanelRightClose,Send,Settings,Square,SquarePen} from '../../lib/icons';
import {createStreamSink} from '../../lib/agent/streaming';
import {chatReducer,initialChat,type ChatItem} from '../../lib/agent/chat';
import {getAgentCore,type AgentProposal,type AgentRun,type ApprovalDecision,type AgentApproval} from '../../lib/agent/core';
import {agentSettingsSnapshot,subscribeAgentSettings,initializeAgentSettings,setAgentActivity,setActiveFileAccess} from '../../lib/agent/settingsRuntime';
import {getState,patchState} from '../../store/appStore';
import {useT} from '../../lib/useT';
import {NativeProposalReview} from './NativeProposalReview';
import {useAppStore} from '../../store/appStore';
import {AgentReview} from '../AgentReview';
import type {Decisions} from '../../lib/agentDiff';
import {AgentErrorNotice,AIGeneratedLabel} from './AgentPrivacy';

export function AgentPanel(){
 const media=useMedia();const app=useAppStore();const target=activeStudioDocument(app,media);const studio=studioAgentContext(app.activeStudio,target.path,app.editorKind);const [disclosure,setDisclosure]=useState<string|null>(null);
 const {t}=useT();const [chat,dispatch]=useReducer(chatReducer,initialChat);const [draft,setDraft]=useState('');
 const settings=useSyncExternalStore(subscribeAgentSettings,agentSettingsSnapshot,agentSettingsSnapshot);
 const {ready:settingsReady,saving,authBusy,error:settingsError}=settings;
 useEffect(()=>{void initializeAgentSettings();},[]);
 useEffect(()=>setDisclosure(null),[settings.config.provider,target.path,app.activeStudio,app.editorKind]);
 const openSettings=()=>patchState({settingsOpen:true,settingsSection:'AI',settingsAITab:'providers',settingsNavigationId:getState().settingsNavigationId+1});
 const requestGeneration=useRef(0);const stream=useRef<ReturnType<typeof createStreamSink>|null>(null);
 const run=useRef<AgentRun|null>(null);const scroller=useRef<HTMLDivElement>(null);const input=useRef<HTMLInputElement>(null);const pinned=useRef(true);
 const [announce,setAnnounce]=useState('');
 useEffect(()=>{requestGeneration.current++;stream.current?.close();run.current?.cancel();run.current=null;},[settings.revision]);
 useEffect(()=>()=>{requestGeneration.current++;stream.current?.close();run.current?.cancel();setAgentActivity(false,false);},[]);
 useEffect(()=>{const el=scroller.current;if(el&&pinned.current)el.scrollTop=el.scrollHeight;},[chat.items]);
 useEffect(()=>{const last=chat.items.at(-1);setAnnounce(chat.busy?t('agent.input.busy'):last?.kind==='error'?'Generation interrupted. Review the error message.':last?.kind==='stopped'?'Generation stopped.':chat.items.length?t('agent.status.done'):'');},[chat.busy,chat.items,t]);
 const send=useCallback((raw:string)=>{
  const text=raw.trim();if(!text||chat.busy||!settingsReady||saving||authBusy)return;
  const generation=++requestGeneration.current;dispatch({type:'send',text});setDraft('');setDisclosure(null);pinned.current=true;const s=getState();
  stream.current?.close();const sink=createStreamSink(event=>{if(generation===requestGeneration.current)dispatch({type:'event',event});});stream.current=sink;
  void getAgentCore().then(core=>{if(generation!==requestGeneration.current)return;run.current=core.run({prompt:text,context:{activeFile:target.media?'':target.path,activeMedia:target.media?target.path:undefined,selectedElementId:s.selectedElementId,disclosureProvider:disclosure??undefined}},event=>{if(generation===requestGeneration.current)sink.receive(event);});}).catch(e=>{if(generation!==requestGeneration.current)return;reportError('agent.start',e,{message:'Agent could not start'});sink.receive({type:'error',message:'Agent could not start. Check your configuration and try again.',retryable:true});});
 },[chat.busy,settingsReady,saving,authBusy,disclosure,target.path,target.media]);
 const stop=()=>{stream.current?.close(true);requestGeneration.current++;run.current?.cancel();run.current=null;dispatch({type:'stop'});input.current?.focus();};
 const reset=()=>{stop();void getAgentCore().then(c=>c.clear?.());dispatch({type:'reset'});setDraft('');};
 const resolve=async(p:AgentProposal,state:'accepted'|'rejected',decisions?:Decisions)=>{
  const core=await getAgentCore();try{await(state==='accepted'?core.applyProposal(p.id,decisions):core.rejectProposal(p.id));dispatch({type:'resolve',proposalId:p.id,state});}
  catch(e){reportError('agent.apply',e,{message:`Proposal ${state==='accepted'?'apply':'reject'} failed`,level:'warn'});dispatch({type:'event',event:{type:'error',message:e instanceof Error?e.message:String(e)}});}
 };
 useEffect(()=>{setAgentActivity(chat.busy,chat.items.some(i=>i.kind==='diff'&&i.state==='pending'));},[chat.busy,chat.items]);
 const empty=chat.items.length===0;
 return <aside className="ag-panel" aria-label={t('agent.title')}>
  <header className="ag-hd">
   <button type="button" className="ag-ib ag-hd-left" title={t('agent.newChat')} aria-label={t('agent.newChat')} onClick={reset}><SquarePen size={17}/></button><h2>{t('agent.title')}</h2>
   <div className="ag-hd-right"><button type="button" className="ag-ib" title="Agent configuration" aria-label="Agent configuration" disabled={chat.busy||!settingsReady||saving||authBusy} onClick={openSettings}><Settings size={17}/></button><button type="button" className="ag-ib" title={t('agent.collapse')} aria-label={t('agent.collapse')} onClick={()=>patchState({agentOpen:false})}><PanelRightClose size={17}/></button></div>
  </header>
  <div className="ag-chat" ref={scroller} onScroll={e=>{const el=e.currentTarget;pinned.current=el.scrollHeight-el.scrollTop-el.clientHeight<48;}} role="log" aria-live="off" aria-label={t('agent.title')}>
   <AgentAccountStatus provider={settings.config.provider}/>
   <div className="ag-safety"><AgentErrorNotice/><p role="status">{settings.config.provider} · {settings.config.model||'No model selected'}</p><button type="button" onClick={()=>patchState({settingsOpen:true,settingsSection:'AI',settingsAITab:'privacy',settingsNavigationId:getState().settingsNavigationId+1})}>Cloud data consent</button></div>
   <label className="ag-context-permission"><input type="checkbox" checked={settings.config.allowActiveFile} disabled={chat.busy||saving||authBusy} onChange={e=>setActiveFileAccess(e.target.checked)}/>Allow inspecting the active studio document and selection. Every edit requires preview acceptance.</label>
   <p className="ag-context-chip" role="status">{studio.label}: {target.path||'No document'} · {target.path?studio.scope:'General guidance, no document context'}</p>
   {settings.config.provider!=='ollama'&&target.path&&<label className="ag-context-permission"><input type="checkbox" checked={disclosure===settings.config.provider} disabled={chat.busy} onChange={e=>setDisclosure(e.target.checked?settings.config.provider:null)}/>Disclose this run's active document and selection to {settings.config.provider}. Cloud consent is also required.</label>}
   {settingsError&&<p role="alert">{settingsError}</p>}
   {empty?<div className="ag-empty"><div className="ag-orb" aria-hidden="true"/><h3>{t('agent.empty.title')}</h3><span>{studio.label==='Code'?t('agent.empty.body'):`Describe what you want to do in ${studio.label}. ${studio.scope}.`}</span><div className="ag-chips">{studio.actions.map(c=><button type="button" key={c} className="ag-chip" onClick={()=>{setDraft(c);input.current?.focus();}}>{c}</button>)}</div><p className="ag-tip">Choose a model, then describe your task. File access and proposed changes need your review.</p></div>:chat.items.map((item,index)=><Row key={item.id} item={item} busy={chat.busy} onRetry={()=>{const last=chat.items.slice(0,index).reverse().find(i=>i.kind==='user');if(last&&last.kind==='user')send(last.text);}} onAccept={(p,d)=>void resolve(p,'accepted',d)} onReject={p=>void resolve(p,'rejected')} onUndo={async p=>{try{await(await getAgentCore()).revertProposal(p.id);dispatch({type:'resolve',proposalId:p.id,state:'undone'});}catch(e){dispatch({type:'event',event:{type:'error',message:e instanceof Error?e.message:String(e)}});}}}/>)}
  </div>
  <div className="ag-bar" aria-hidden="true"><div className="ag-pb"><i/><i/><i/><i/></div><div className="ag-grad"/></div>
  <div className="ag-inp"><form className="ag-field" onSubmit={e=>{e.preventDefault();if(chat.busy)stop();else send(draft);}}>
   <input ref={input} value={draft} disabled={chat.busy||!settingsReady||saving||authBusy} onChange={e=>setDraft(e.target.value)} placeholder={chat.busy?t('agent.input.busy'):t('agent.input.placeholder')} aria-label={t('agent.input.label')} autoComplete="off"/>
   {chat.busy?<button type="submit" className="ag-send ag-stop" title={t('agent.stop')} aria-label={t('agent.stop')}><Square size={14} fill="currentColor"/></button>:<button type="submit" className="ag-send" title={t('agent.send')} aria-label={t('agent.send')} disabled={!draft.trim()||!settingsReady||saving||authBusy}><Send size={17}/></button>}
  </form></div>
  <span className="sr-only" role="status" aria-live="polite">{announce}</span>
 </aside>;
}
function Approval({approval}:{approval:AgentApproval}){
 const [decision,setDecision]=useState<ApprovalDecision|null>(null);
 return <section className="ag-approval" aria-label="File access approval"><strong>{approval.action}</strong><code>{approval.path}</code><p>File contents may contain private information. Grant only the context you want the selected model to receive.</p>{decision?<p role="status">{decision}</p>:<div>{(['accept','accept_for_session','decline','cancel'] as const).map(d=><button type="button" key={d} onClick={()=>{setDecision(d);approval.resolve(d);}}>{({accept:'Accept once',accept_for_session:'Accept for session',decline:'Decline',cancel:'Cancel'})[d]}</button>)}</div>}</section>;
}
function Row({item,onAccept,onReject,onRetry,busy,onUndo}:{item:ChatItem;onUndo:(p:AgentProposal)=>void;busy:boolean;onRetry:()=>void;onAccept:(p:AgentProposal,d:Decisions)=>void;onReject:(p:AgentProposal)=>void}){
 switch(item.kind){
  case 'user':return <div className="ag-b ag-u"><p data-copyable>{item.text}</p></div>;
  case 'agent':return <div className="ag-b ag-a"><AIGeneratedLabel/><p data-copyable className="ag-answer" aria-busy={item.streaming}>{item.text}{item.streaming&&<span className="ag-caret" aria-hidden="true"/>}</p>{item.incomplete&&<small className="ag-incomplete">{item.incomplete==='stopped'?'Stopped - partial response':'Interrupted - partial response'}</small>}</div>;
  case 'stopped':return <p className="ag-stopped" role="status">{item.text}</p>;
  case 'status':return <div className="ag-status"><LoaderCircle size={17} className="ag-spin"/>{item.text}</div>;
  case 'error':return <div className="ag-error" role="alert" data-copyable>{item.text}{item.retryable&&<button type="button" className="ag-retry" disabled={busy} onClick={onRetry}>Retry</button>}</div>;
  case 'usage':return <p className="ag-usage">{item.text}</p>;
  case 'approval':return <Approval approval={item.approval}/>;
  case 'diff':return <div className="ag-review" data-state={item.state}><AIGeneratedLabel provenance={item.proposal.changeSet?.provenance}/>{item.state==='pending'&&item.proposal.native?<NativeProposalReview proposal={item.proposal} onAccept={onAccept} onReject={()=>onReject(item.proposal)}/>:item.state==='pending'&&item.proposal.changeSet?<AgentReview changeSet={item.proposal.changeSet} readCurrent={p=>getState().files[p]??null} onApply={(_,d)=>onAccept(item.proposal,d)} onDiscard={()=>onReject(item.proposal)}/>:<p>{item.state==='accepted'?item.proposal.photo?'Applied to Photo memory, not saved. Use Save Photo copy as PNG. Original file unchanged.':item.proposal.native?.base.studioKind==='code'?'Applied to editor, not saved. Use Save project to save, or editor Undo to revert.':'Applied to studio memory, not saved. Use the studio save-copy or export action to save.':item.state==='undone'?'AI transaction undone. Nothing saved.':'Proposal discarded.'}</p>}{item.state==='accepted'&&item.proposal.native&&<button className="ag-native-undo" type="button" onClick={()=>onUndo(item.proposal)}>Undo AI transaction</button>}</div>;
 }
}
