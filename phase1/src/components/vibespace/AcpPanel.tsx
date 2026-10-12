import {useEffect,useState,useSyncExternalStore} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {getLocale,subscribeLocale,t} from '../../lib/i18n';
import {ACP_LIMITS,nativeAcpPanelStore,promptLength,type AcpPanelStore} from '../../lib/vibespace/acpPanelState';
import {ComputerUseReview} from './ComputerUseReview';
import type {AcpChoice} from '../../lib/vibespace/acpNative';
/** Native-only ACP dock. Explicit store/availability injection is reserved for tests. */
export function AcpPanel({store=nativeAcpPanelStore,available=isTauri(),disabled=false}:{store?:AcpPanelStore;available?:boolean;disabled?:boolean}){
 useSyncExternalStore(subscribeLocale,getLocale,getLocale);
 const text=(key:string,params?:Record<string,string|number>)=>t(`vibespace.acp.ui.${key}`,params);
 const rows=useSyncExternalStore(store.subscribe,store.snapshot,store.snapshot);
 const [selected,setSelected]=useState(''),[name,setName]=useState(''),[program,setProgram]=useState(''),[args,setArgs]=useState(''),[prompt,setPrompt]=useState('');
 const [launching,setLaunching]=useState(false),[connected,setConnected]=useState(false),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!available)return;let alive=true;let off:(()=>void)|undefined;
  setConnected(false);
  void store.client.onChanged(key=>{void store.refresh(key);}).then(unlisten=>{if(!alive){unlisten();return;}off=unlisten;setConnected(true);},()=>{if(alive)setError(true);});
  const poll=()=>store.snapshot().forEach(r=>{if(!r.state||!['failed','closed'].includes(r.state.status))void store.refresh(r.key);});
  poll();const timer=setInterval(poll,2000);
  return()=>{alive=false;off?.();clearInterval(timer);};
 },[available,store,retry]);
 const row=rows.find(r=>r.key===selected)??rows.at(-1);const state=row?.state;
 const blocked=!available||!connected||disabled;
 const live=rows.filter(r=>!r.state||!['failed','closed'].includes(r.state.status)).length;
 const ready=!!row&&!row.readFailed&&state?.status==='ready';
 const act=(operation:()=>Promise<unknown>)=>{setError(false);void operation().catch(()=>setError(true));};
 const decide=(requestId:string,choice:AcpChoice)=>{if(!row)return;act(()=>store.action(row.key,()=>store.client.decideConsent(row.key,requestId,choice)));};
 return <section className="vs-card vs-acp" aria-label={text('title')}>
  <h3>{text('title')}</h3><p className="vs-muted">{t('vibespace.acp.noElevated')}</p>
  <p className="vs-muted">{text('limits',{sessions:ACP_LIMITS.sessions,prompt:ACP_LIMITS.prompt,events:ACP_LIMITS.events})}</p>
  {(!available||!connected)&&<p role="status" className="vs-notice">{text('unavailable')}</p>}
  {error&&<p role="alert" className="vs-notice">{text('error')}</p>}
  {available&&!connected&&<button onClick={()=>{setError(false);setRetry(n=>n+1);}}>{text('reconnect')}</button>}
  <form aria-label={text('launch')} onSubmit={e=>{e.preventDefault();if(blocked||launching||live>=ACP_LIMITS.sessions||!name.trim()||!program.trim())return;
   let argv:string[];try{const parsed:unknown=JSON.parse(args||'[]');if(!Array.isArray(parsed)||parsed.some(a=>typeof a!=='string'))throw new Error();argv=parsed;}catch{setError(true);return;}
   setLaunching(true);act(()=>store.launch(name.trim(),program.trim(),argv).then(key=>{setSelected(key);setName('');setProgram('');setArgs('');}).finally(()=>setLaunching(false)));
  }}><fieldset disabled={blocked||launching||live>=ACP_LIMITS.sessions}><legend>{text('launch')}</legend>
   <label>{text('name')}<input value={name} maxLength={60} onChange={e=>setName(e.target.value)}/></label>
   <label>{text('program')}<input value={program} onChange={e=>setProgram(e.target.value)}/></label>
   <label>{text('args')}<input value={args} placeholder="[]" onChange={e=>setArgs(e.target.value)}/></label>
   <button type="submit" disabled={!name.trim()||!program.trim()}>{text('launch')}</button>
  </fieldset></form>
  {live>=ACP_LIMITS.sessions&&<p role="status">{text('sessionLimit')}</p>}
  <nav className="vs-actions" aria-label={text('sessions')}>{rows.map(r=><button key={r.key} aria-pressed={row?.key===r.key} onClick={()=>setSelected(r.key)}>{r.state?.name||r.name} · {text('status.'+(r.readFailed?'unknown':r.state?.status??'loading'))}</button>)}</nav>
  {!row&&<p className="vs-muted">{text('empty')}</p>}
  {row&&<>
   {row.readFailed&&<p role="alert">{text('readFailed')}</p>}
   {state?.failure&&<p role="alert">{text('failed')} <code>{state.failure}</code></p>}
   <div className="vs-actions"><button disabled={blocked||!ready||row.busy||row.turn||!!state?.pending.length} onClick={()=>act(()=>store.action(row.key,()=>store.client.openSession(row.key).then(()=>store.patch(row.key,{opened:true}))))}>{text('newSession')}</button>
    <button disabled={blocked||!ready||row.busy||row.turn||!state?.lastSessionId||!!state.pending.length} onClick={()=>act(()=>store.action(row.key,()=>store.client.openSession(row.key,true).then(()=>store.patch(row.key,{opened:true}))))}>{text('resume')}</button>
    <button disabled={blocked||!row.turn||row.busy} onClick={()=>act(()=>store.action(row.key,()=>store.client.cancel(row.key,{graceMs:1000})))}>{text('cancel')}</button>
    <button disabled={blocked||row.busy||state?.status==='closed'} onClick={()=>act(()=>store.action(row.key,()=>store.client.cancel(row.key,{close:true})))}>{text('close')}</button>
    <button disabled={!available||row.busy} onClick={()=>void store.refresh(row.key)}>{text('refresh')}</button></div>
   {state?.pending.map(c=><section key={c.requestId} className="vs-card vs-consent" role="alertdialog" aria-label={text('consent')}>
    <h4>{text('consent')}</h4>{c.origin&&<p>{t(c.origin.key,c.origin.params)}</p>}<dl><dt>{text('kind')}</dt><dd>{c.kind}</dd><dt>{text('target')}</dt><dd data-copyable>{c.target}</dd><dt>{text('reason')}</dt><dd>{c.reason}</dd></dl>
    {c.kind==='desktop'&&<ComputerUseReview/>}<p className="vs-muted">{text('exactConsent')}</p>
    <div className="vs-actions">{(['allow_once','allow_for_run','deny'] as const).map(choice=><button key={choice} disabled={blocked||row.readFailed||row.busy||!c.requestId||!state||!(['ready','awaiting_approval'].includes(state.status))||(choice!=='deny'&&c.kind==='desktop')||(choice==='allow_once'&&!c.allowOnce)||(choice==='allow_for_run'&&!c.allowForRun)} onClick={()=>decide(c.requestId,choice)}>{text(choice)}</button>)}</div>
   </section>)}
   <form aria-label={text('prompt')} onSubmit={e=>{e.preventDefault();if(blocked||!ready||!row.opened||row.busy||row.turn||state?.pending.length||!prompt.trim()||promptLength(prompt)>ACP_LIMITS.prompt)return;
    const value=prompt;act(()=>store.action(row.key,()=>store.client.prompt(row.key,value).then(()=>setPrompt(current=>current===value?'':current)),true));
   }}><label>{text('prompt')}<textarea rows={3} disabled={blocked||!ready||!row.opened||row.busy||row.turn} value={prompt} onChange={e=>setPrompt(e.target.value)}/></label>
    <p role="status" className="vs-muted">{text(row.turn?'turn':promptLength(prompt)>ACP_LIMITS.prompt?'promptLimit':'promptCount',{count:promptLength(prompt),max:ACP_LIMITS.prompt})}</p>
    <button type="submit" disabled={blocked||!ready||!row.opened||row.busy||row.turn||!!state?.pending.length||!prompt.trim()||promptLength(prompt)>ACP_LIMITS.prompt}>{text('send')}</button></form>
   <h4>{text('transcript')}</h4><p className="vs-muted">{text(state&&state.eventCount>=ACP_LIMITS.events?'eventLimit':'eventWindow',{max:ACP_LIMITS.events})}</p>
   <ol className="vs-transcript">{state?.transcript.map((line,i)=><li key={i} data-tone={line.tone}>{t(line.key,line.params)}</li>)}</ol>
  </>}
 </section>;
}
