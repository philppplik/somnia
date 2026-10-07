import {ProviderAuthentication} from './ProviderAuthentication';
import {reportError} from '../../lib/log';
import {useCallback,useEffect,useReducer,useRef,useState} from 'react';
import {LoaderCircle,PanelRightClose,Send,Settings,Square,SquarePen} from '../../lib/icons';
import {chatReducer,initialChat,type ChatItem} from '../../lib/agent/chat';
import {getAgentCore,type AgentProposal,type AgentRun,type ApprovalDecision,type AgentApproval} from '../../lib/agent/core';
import {loadAgentSettings,saveAgentSettings} from '../../lib/agent/settings';
import {configureAgent,type AgentConfiguration} from '../../lib/agent/panelBridge';
import {getState,patchState} from '../../store/appStore';
import {useT} from '../../lib/useT';
import {AgentReview} from '../AgentReview';
import type {Decisions} from '../../lib/agentDiff';
import {AgentConsentNotice,AgentErrorNotice,AIGeneratedLabel} from './AgentPrivacy';
const CHIPS=['Help me design a landing page','Make this section responsive','Fix the A11y problems'];
export function AgentPanel(){
 const {t}=useT();const [chat,dispatch]=useReducer(chatReducer,initialChat);const [draft,setDraft]=useState('');
 const [configuration,setConfiguration]=useState(false);const [consent,setConsent]=useState(false);
 const [cfg,setCfg]=useState<AgentConfiguration>({provider:'ollama',model:'',apiKey:'',allowActiveFile:false,customPrompts:[]});
 const [authBusy,setAuthBusy]=useState(false);
 const [settingsReady,setSettingsReady]=useState(false);const [saving,setSaving]=useState(false);const [settingsError,setSettingsError]=useState('');
 useEffect(()=>{let live=true;void loadAgentSettings().then(value=>{if(live){setCfg(value);configureAgent(value);}}).catch(()=>{if(live)setSettingsError('Could not restore Agent settings. Unlock your OS credential store and reopen the panel, or configure this session again.');}).finally(()=>{if(live)setSettingsReady(true);});return()=>{live=false;};},[]);
 const saveConfiguration=async()=>{if(authBusy||saving)return;setSaving(true);setSettingsError('');try{await saveAgentSettings(cfg);configureAgent(cfg);setConfiguration(false);dispatch({type:'reset'});}catch{setSettingsError('Could not save settings. Check your OS credential store. API keys are never saved in plaintext.');}finally{setSaving(false);}};
 const requestGeneration=useRef(0);
 const run=useRef<AgentRun|null>(null);const scroller=useRef<HTMLDivElement>(null);const input=useRef<HTMLInputElement>(null);const pinned=useRef(true);
 const [announce,setAnnounce]=useState('');
 useEffect(()=>()=>{requestGeneration.current++;run.current?.cancel();},[]);
 useEffect(()=>{const el=scroller.current;if(el&&pinned.current)el.scrollTop=el.scrollHeight;},[chat.items]);
 useEffect(()=>{setAnnounce(chat.busy?t('agent.input.busy'):chat.items.length?t('agent.status.done'):'');},[chat.busy]);
 const send=useCallback((raw:string)=>{
  const text=raw.trim();if(!text||chat.busy||!settingsReady||saving||authBusy||configuration)return;
  const generation=++requestGeneration.current;dispatch({type:'send',text});setDraft('');pinned.current=true;const s=getState();
  void getAgentCore().then(core=>{if(generation!==requestGeneration.current)return;run.current=core.run({prompt:text,context:{activeFile:s.activeFile,selectedElementId:s.selectedElementId}},event=>dispatch({type:'event',event}));}).catch(e=>{reportError('agent.start',e,{message:'Agent could not start'});dispatch({type:'event',event:{type:'error',message:String(e)}});});
 },[chat.busy,settingsReady,saving,authBusy,configuration]);
 const stop=()=>{requestGeneration.current++;run.current?.cancel();run.current=null;dispatch({type:'stop'});input.current?.focus();};
 const reset=()=>{stop();void getAgentCore().then(c=>c.clear?.());dispatch({type:'reset'});setDraft('');};
 const resolve=async(p:AgentProposal,state:'accepted'|'rejected',decisions?:Decisions)=>{
  const core=await getAgentCore();try{await(state==='accepted'?core.applyProposal(p.id,decisions):core.rejectProposal(p.id));dispatch({type:'resolve',proposalId:p.id,state});}
  catch(e){reportError('agent.apply',e,{message:`Proposal ${state==='accepted'?'apply':'reject'} failed`,level:'warn'});dispatch({type:'event',event:{type:'error',message:e instanceof Error?e.message:String(e)}});}
 };
 useEffect(()=>{
  if(!consent)return;
  const previous=document.activeElement as HTMLElement|null;
  const dialog=document.querySelector<HTMLElement>('.ag-consent');
  const trap=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){setConsent(false);return;}
   if(e.key!=='Tab'||!dialog)return;
   const controls=[...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),a[href]')];
   const first=controls[0],last=controls[controls.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  };
  document.addEventListener('keydown',trap);return()=>{document.removeEventListener('keydown',trap);previous?.focus();};
 },[consent]);
 const empty=chat.items.length===0;
 return <aside className="ag-panel" aria-label={t('agent.title')}>
  <header className="ag-hd">
   <button type="button" className="ag-ib ag-hd-left" title={t('agent.newChat')} aria-label={t('agent.newChat')} onClick={reset}><SquarePen size={17}/></button><h2>{t('agent.title')}</h2>
   <div className="ag-hd-right"><button type="button" className="ag-ib" title="Agent configuration" aria-label="Agent configuration" disabled={chat.busy||!settingsReady||saving||authBusy} onClick={()=>setConfiguration(v=>!v)}><Settings size={17}/></button><button type="button" className="ag-ib" title={t('agent.collapse')} aria-label={t('agent.collapse')} onClick={()=>patchState({agentOpen:false})}><PanelRightClose size={17}/></button></div>
  </header>
  <div className="ag-chat" ref={scroller} onScroll={e=>{const el=e.currentTarget;pinned.current=el.scrollHeight-el.scrollTop-el.clientHeight<48;}} role="log" aria-label={t('agent.title')}>
   <div className="ag-safety"><AgentErrorNotice/><button type="button" onClick={()=>setConsent(true)}>Cloud data consent</button></div>
   {settingsError&&<p role="alert">{settingsError}</p>}
   {configuration&&<form className="ag-config" aria-label="Agent configuration" onSubmit={e=>{e.preventDefault();void saveConfiguration();}}>
    <label>Provider<select value={cfg.provider} disabled={authBusy||saving} onChange={e=>setCfg({...cfg,provider:e.target.value as AgentConfiguration['provider']})}><option value="ollama">Ollama (local verification required)</option><option value="openrouter">OpenRouter (cloud)</option></select></label>
    <label>Model<input required value={cfg.model} onChange={e=>setCfg({...cfg,model:e.target.value})} placeholder="Installed model or provider/model"/></label>
    <ProviderAuthentication provider={cfg.provider} disabled={saving} onBusyChange={setAuthBusy} onCredentialChange={()=>{void getAgentCore().then(c=>c.clear?.());dispatch({type:'reset'});}}/>
    <fieldset><legend>Custom prompts</legend><p>Enabled prompts are included with every AI request. Do not put secrets here. File access and cloud consent still require approval.</p>
     {(cfg.customPrompts??[]).map((p,i)=><div key={p.id}>
      <label>Prompt name {i+1}<input maxLength={120} value={p.name} onChange={e=>setCfg({...cfg,customPrompts:cfg.customPrompts!.map(x=>x.id===p.id?{...x,name:e.target.value}:x)})}/></label>
      <label>Prompt text {i+1}<textarea maxLength={8000} value={p.text} onChange={e=>setCfg({...cfg,customPrompts:cfg.customPrompts!.map(x=>x.id===p.id?{...x,text:e.target.value}:x)})}/></label>
      <label><input type="checkbox" checked={p.enabled} onChange={e=>setCfg({...cfg,customPrompts:cfg.customPrompts!.map(x=>x.id===p.id?{...x,enabled:e.target.checked}:x)})}/>Enable prompt {i+1}</label>
      <button type="button" onClick={()=>setCfg({...cfg,customPrompts:cfg.customPrompts!.filter(x=>x.id!==p.id)})}>Delete prompt {i+1}</button>
     </div>)}
     <button type="button" disabled={(cfg.customPrompts?.length??0)>=20} onClick={()=>setCfg({...cfg,customPrompts:[...(cfg.customPrompts??[]),{id:crypto.randomUUID(),name:'',text:'',enabled:true}]})}>Add custom prompt</button>
    </fieldset>
    <label><input type="checkbox" checked={cfg.allowActiveFile} onChange={e=>setCfg({...cfg,allowActiveFile:e.target.checked})}/>Allow reading the active file into model context. Other file reads and all writes ask first.</label>
    <button type="submit" disabled={saving||authBusy}>{saving?'Saving...':'Use configuration'}</button><button type="button" onClick={()=>{setConfiguration(false);patchState({settingsOpen:true,settingsSection:'AI privacy'});}}>AI privacy settings</button>
   </form>}
   {empty?<div className="ag-empty"><div className="ag-orb" aria-hidden="true"/><h3>{t('agent.empty.title')}</h3><span>{t('agent.empty.body')}</span><div className="ag-chips">{CHIPS.map(c=><button type="button" key={c} className="ag-chip" onClick={()=>{setDraft(c);input.current?.focus();}}>{c}</button>)}</div><p className="ag-tip">Choose a model, then describe your task. File access and proposed changes need your review.</p></div>:chat.items.map(item=><Row key={item.id} item={item} onRetry={()=>{const last=[...chat.items].reverse().find(i=>i.kind==='user');if(last&&last.kind==='user')send(last.text);}} onAccept={(p,d)=>void resolve(p,'accepted',d)} onReject={p=>void resolve(p,'rejected')}/>)}
  </div>
  <div className="ag-bar" aria-hidden="true"><div className="ag-pb"><i/><i/><i/><i/></div><div className="ag-grad"/></div>
  <div className="ag-inp"><form className="ag-field" onSubmit={e=>{e.preventDefault();if(chat.busy)stop();else send(draft);}}>
   <input ref={input} value={draft} disabled={chat.busy||!settingsReady||saving||authBusy} onChange={e=>setDraft(e.target.value)} placeholder={chat.busy?t('agent.input.busy'):t('agent.input.placeholder')} aria-label={t('agent.input.label')} autoComplete="off"/>
   {chat.busy?<button type="submit" className="ag-send ag-stop" title={t('agent.stop')} aria-label={t('agent.stop')}><Square size={14} fill="currentColor"/></button>:<button type="submit" className="ag-send" title={t('agent.send')} aria-label={t('agent.send')} disabled={!draft.trim()||!settingsReady||saving||authBusy||configuration}><Send size={17}/></button>}
  </form></div>
  {consent&&<div className="ag-consent-backdrop"><div role="dialog" aria-modal="true" aria-label="Cloud data consent" className="ag-consent"><button type="button" autoFocus onClick={()=>setConsent(false)}>Close consent</button><AgentConsentNotice onGranted={()=>setConsent(false)}/></div></div>}
  <span className="sr-only" role="status" aria-live="polite">{announce}</span>
 </aside>;
}
function Approval({approval}:{approval:AgentApproval}){
 const [decision,setDecision]=useState<ApprovalDecision|null>(null);
 return <section className="ag-approval" aria-label="File access approval"><strong>{approval.action}</strong><code>{approval.path}</code><p>File contents may contain private information. Grant only the context you want the selected model to receive.</p>{decision?<p role="status">{decision}</p>:<div>{(['accept','accept_for_session','decline','cancel'] as const).map(d=><button type="button" key={d} onClick={()=>{setDecision(d);approval.resolve(d);}}>{({accept:'Accept once',accept_for_session:'Accept for session',decline:'Decline',cancel:'Cancel'})[d]}</button>)}</div>}</section>;
}
function Row({item,onAccept,onReject,onRetry}:{item:ChatItem;onRetry:()=>void;onAccept:(p:AgentProposal,d:Decisions)=>void;onReject:(p:AgentProposal)=>void}){
 switch(item.kind){
  case 'user':return <div className="ag-b ag-u"><p data-copyable>{item.text}</p></div>;
  case 'agent':return <div className="ag-b ag-a"><AIGeneratedLabel/><p data-copyable>{item.text}{item.streaming&&<span className="ag-caret"/>}</p></div>;
  case 'status':return <div className="ag-status"><LoaderCircle size={17} className="ag-spin"/>{item.text}</div>;
  case 'error':return <div className="ag-error" role="alert" data-copyable>{item.text}{item.retryable&&<button type="button" className="ag-retry" onClick={onRetry}>Retry</button>}</div>;
  case 'usage':return <p className="ag-usage">{item.text}</p>;
  case 'approval':return <Approval approval={item.approval}/>;
  case 'diff':return <div className="ag-review" data-state={item.state}><AIGeneratedLabel provenance={item.proposal.changeSet?.provenance}/>{item.state==='pending'&&item.proposal.changeSet?<AgentReview changeSet={item.proposal.changeSet} readCurrent={p=>getState().files[p]??null} onApply={(_,d)=>onAccept(item.proposal,d)} onDiscard={()=>onReject(item.proposal)}/>:<p>{item.state==='accepted'?'Applied to editor, not saved. Use Save project to save, or editor Undo to revert.':'Proposal discarded.'}</p>}</div>;
 }
}
