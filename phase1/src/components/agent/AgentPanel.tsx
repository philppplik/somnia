import {useCallback,useEffect,useReducer,useRef,useState} from 'react';
import {Check,LoaderCircle,Lightbulb,Paperclip,PanelRightClose,RotateCcw,Send,Settings,Square,SquarePen,X} from '../../lib/icons';
import {chatReducer,initialChat,type ChatItem} from '../../lib/agent/chat';
import {getAgentCore,type AgentProposal,type AgentRun} from '../../lib/agent/core';
import {getState,patchState} from '../../store/appStore';
import {useT} from '../../lib/useT';
const CHIPS=['Help me design a landing page','Make this section responsive','Fix the A11y problems'];
/** Right side panel for Somnia Agent. Talks to the core only through lib/agent/core (stub until agent/core lands). */
export function AgentPanel(){
 const {t}=useT();const [chat,dispatch]=useReducer(chatReducer,initialChat);const [draft,setDraft]=useState('');
 const run=useRef<AgentRun|null>(null);const scroller=useRef<HTMLDivElement>(null);const input=useRef<HTMLInputElement>(null);const pinned=useRef(true);
 const [announce,setAnnounce]=useState('');
 useEffect(()=>()=>run.current?.cancel(),[]);
 useEffect(()=>{const el=scroller.current;if(el&&pinned.current)el.scrollTop=el.scrollHeight;},[chat.items]);
 useEffect(()=>{setAnnounce(chat.busy?t('agent.input.busy'):chat.items.length?t('agent.status.done'):'');},[chat.busy]);// eslint-disable-line react-hooks/exhaustive-deps
 const send=useCallback((raw:string)=>{
  const text=raw.trim();if(!text||chat.busy)return;
  dispatch({type:'send',text});setDraft('');pinned.current=true;
  const s=getState();
  void getAgentCore().then(core=>{run.current=core.run({prompt:text,context:{activeFile:s.activeFile,selectedElementId:s.selectedElementId}},event=>dispatch({type:'event',event}));});
 },[chat.busy]);
 const stop=()=>{run.current?.cancel();run.current=null;dispatch({type:'stop'});input.current?.focus();};
 const reset=()=>{run.current?.cancel();run.current=null;dispatch({type:'reset'});setDraft('');input.current?.focus();};
 const resolve=async(p:AgentProposal,state:'accepted'|'rejected')=>{
  const core=await getAgentCore();
  try{await (state==='accepted'?core.applyProposal(p.id):core.rejectProposal(p.id));dispatch({type:'resolve',proposalId:p.id,state});}
  catch(e){dispatch({type:'event',event:{type:'error',message:e instanceof Error?e.message:String(e)}});}
 };
 const revert=async(p:AgentProposal,from:'accepted'|'rejected')=>{const core=await getAgentCore();try{if(from==='accepted')await core.revertProposal(p.id);dispatch({type:'resolve',proposalId:p.id,state:'pending'});}catch{/* stays as is */}};
 const empty=chat.items.length===0;
 return <aside className="ag-panel" aria-label={t('agent.title')}>
  <header className="ag-hd">
   <button type="button" className="ag-ib ag-hd-left" title={t('agent.newChat')} aria-label={t('agent.newChat')} onClick={reset}><SquarePen size={17}/></button>
   <h2>{t('agent.title')}</h2>
   <div className="ag-hd-right">
    <button type="button" className="ag-ib" title={t('agent.settings')} aria-label={t('agent.settings')} onClick={()=>patchState({settingsOpen:true})}><Settings size={17}/></button>
    <button type="button" className="ag-ib" title={t('agent.collapse')} aria-label={t('agent.collapse')} onClick={()=>patchState({agentOpen:false})}><PanelRightClose size={17}/></button>
   </div>
  </header>
  <div className="ag-chat" ref={scroller} onScroll={e=>{const el=e.currentTarget;pinned.current=el.scrollHeight-el.scrollTop-el.clientHeight<48;}} role="log" aria-label={t('agent.title')}>
   {empty?<>
    <div className="ag-empty"><div className="ag-orb" aria-hidden="true"/><h3>{t('agent.empty.title')}</h3><span>{t('agent.empty.body')}</span>
     <div className="ag-chips">{CHIPS.map(c=><button type="button" key={c} className="ag-chip" onClick={()=>send(c)}>{c}</button>)}</div></div>
    <div className="ag-tip"><Lightbulb size={16}/><span><b>{t('agent.tip.label')}</b> {t('agent.tip.body')}</span></div>
   </>:chat.items.map(item=><Row key={item.id} item={item} onAccept={p=>void resolve(p,'accepted')} onReject={p=>void resolve(p,'rejected')} onRevert={(p,from)=>void revert(p,from)}/>)}
  </div>
  <div className="ag-bar" aria-hidden="true"><div className="ag-pb"><i/><i/><i/><i/></div><div className="ag-grad"/></div>
  <div className="ag-inp"><form className="ag-field" onSubmit={e=>{e.preventDefault();if(chat.busy)stop();else send(draft);}}>
   <button type="button" className="ag-ib" title={t('agent.attach')} aria-label={t('agent.attach')} disabled={chat.busy} onClick={()=>{setDraft(d=>d+(d&&!d.endsWith(' ')?' @':'@'));input.current?.focus();}}><Paperclip size={17}/></button>
   <input ref={input} value={draft} disabled={chat.busy} onChange={e=>setDraft(e.target.value)} placeholder={chat.busy?t('agent.input.busy'):t('agent.input.placeholder')} aria-label={t('agent.input.label')} autoComplete="off"/>
   {chat.busy
    ?<button type="submit" className="ag-send ag-stop" title={t('agent.stop')} aria-label={t('agent.stop')}><Square size={14} fill="currentColor"/></button>
    :<button type="submit" className="ag-send" title={t('agent.send')} aria-label={t('agent.send')} disabled={!draft.trim()}><Send size={17}/></button>}
  </form></div>
  <span className="sr-only" role="status" aria-live="polite">{announce}</span>
 </aside>;
}
function Row({item,onAccept,onReject,onRevert}:{item:ChatItem;onAccept:(p:AgentProposal)=>void;onReject:(p:AgentProposal)=>void;onRevert:(p:AgentProposal,from:'accepted'|'rejected')=>void}){
 const {t}=useT();
 switch(item.kind){
  case 'user':return <div className="ag-b ag-u"><p>{item.text}</p></div>;
  case 'agent':return <div className="ag-b ag-a"><p>{item.text}{item.streaming&&<span className="ag-caret"/>}</p></div>;
  case 'status':return <div className="ag-status"><LoaderCircle size={17} className="ag-spin"/>{item.file?t('agent.status.editing',{file:item.file}):item.text}<span className="ag-dots" aria-hidden="true"><i/><i/><i/></span></div>;
  case 'error':return <div className="ag-error" role="alert">{t('agent.error',{message:item.text})}</div>;
  case 'diff':{const p=item.proposal;return <div className="ag-diff" data-state={item.state}>
   <div className="ag-dh"><SparklesMark/><b>{p.file}</b><span>+{p.added} −{p.removed}</span></div>
   <pre>{p.lines.map((l,i)=><span key={i} className={l.kind==='del'?'ag-del':l.kind==='add'?'ag-add':undefined}>{l.kind==='del'?'- ':l.kind==='add'?'+ ':'  '}{l.text}</span>)}</pre>
   {item.state==='pending'
    ?<div className="ag-da"><button type="button" className="ag-dbtn ag-no" onClick={()=>onReject(p)}><X size={15}/>{t('agent.diff.reject')}</button><button type="button" className="ag-dbtn ag-ok" onClick={()=>onAccept(p)}><Check size={15}/>{t('agent.diff.accept')}</button></div>
    :<div className="ag-da"><span className="ag-result">{item.state==='accepted'?t('agent.diff.accepted'):t('agent.diff.rejected')}</span><button type="button" className="ag-dbtn ag-no ag-undo" onClick={()=>onRevert(p,item.state as 'accepted'|'rejected')}><RotateCcw size={15}/>{t('agent.diff.undo')}</button></div>}
  </div>;}
 }
}
import {Sparkles} from '../../lib/icons';
const SparklesMark=()=><Sparkles size={15}/>;
