import {useState} from 'react';
import {useT} from '../../lib/useT';
import type {ExtensionsPopupHost,UpdateDiff} from '../../lib/extensions/popupHost';
import {describeChange,filterInstalled,groupByDay,shortHash,showsSignedMatch,sortNewest,switchState,timeOf,resultKey,type GrantRow,type LogState,type PopupExtension,type StateFilter} from '../../lib/extensions/popupModel';
import type {ActivityEvent} from '../../lib/extensions/securityActivity';
import {ExtensionIdentity,InlineError,PermissionTags,Switch,useApiLabel,useInlineError} from './parts';

const FILTERS:StateFilter[]=['all','enabled','panels','themes','commands'];

function lastLine(t:ReturnType<typeof useT>['t'],e:PopupExtension){
 if(e.status==='blocked')return t('ext.status.blocked');
 if(e.status==='crashed')return t('ext.status.crashed');
 if(e.status==='update-consent')return t('ext.status.updateConsent');
 const a=e.lastActivity;
 const dis=e.enabled?'':`${t('ext.status.disabled')} · `;
 if(a==='unreadable')return `${dis}${t('ext.activity.unreadable')}`;
 if(!a)return `${dis}${e.grants.some(g=>g.granted)?t('ext.last.none'):t('ext.last.noCalls')}`;
 const when=timeOf(a.ts).slice(0,5);
 return `${dis}${t('ext.last.active',{time:when})}${a.target?` · ${a.target}`:''}`;
}

export function ExtensionCard({ext,host,onOpen,onOverflow,onChanged}:{ext:PopupExtension;host:ExtensionsPopupHost;onOpen:()=>void;onOverflow:()=>void;onChanged:()=>void}){
 const {t}=useT();const [pending,setPending]=useState(false);const {error,setError,id}=useInlineError();
 const sw=switchState(ext,pending);
 const toggle=async(next:boolean)=>{setPending(true);setError(null);try{await host.setEnabled(ext.id,next);onChanged();}catch(e){setError(e instanceof Error&&e.message?e.message:t('ext.error.generic'));}finally{setPending(false);}};
 return <li className="ext-card" aria-describedby={error?id:undefined}>
  <button type="button" className="ext-card-main" onClick={onOpen} aria-label={t('ext.card.open',{name:ext.name})}>
   <ExtensionIdentity ext={ext}><p className="ext-desc">{ext.description}</p></ExtensionIdentity>
  </button>
  <div className="ext-card-extra"><PermissionTags ext={ext} onOverflow={onOverflow}/><p className="ext-meta">{lastLine(t,ext)}</p><InlineError id={id} message={error}/></div>
  <div className="ext-card-switch"><Switch checked={sw.checked} disabled={!sw.canEnable&&!ext.enabled} busy={pending} label={t(ext.enabled?'ext.switch.disable':'ext.switch.enable',{name:ext.name})} onChange={toggle}/></div>
 </li>;
}

export function InstalledView({list,host,query,setQuery,filter,setFilter,onOpen,onBrowse,onAdd,onChanged}:{list:PopupExtension[];host:ExtensionsPopupHost;query:string;setQuery:(q:string)=>void;filter:StateFilter;setFilter:(f:StateFilter)=>void;onOpen:(id:string,section?:string)=>void;onBrowse:()=>void;onAdd:()=>void;onChanged:()=>void}){
 const {t}=useT();const shown=filterInstalled(list,query,filter);const {error,setError,id}=useInlineError();const [done,setDone]=useState(false);const [confirm,setConfirm]=useState(false);
 const disableAll=async()=>{setError(null);try{await host.disableAll();setDone(true);setConfirm(false);onChanged();}catch(e){setError(e instanceof Error&&e.message?e.message:t('ext.error.generic'));}};
 const enabledN=list.filter(e=>e.enabled).length;
 if(list.length===0)return <div className="ext-empty"><h3>{t('ext.empty.title')}</h3><p>{t('ext.empty.body')}</p><div className="ext-row"><button type="button" className="ext-btn ext-btn-primary" onClick={onBrowse}>{t('ext.nav.browse')}</button><button type="button" className="ext-btn" onClick={onAdd}>{t('ext.add.button')}</button></div></div>;
 return <div className="ext-view">
  <div className="ext-toolbar"><input type="search" aria-label={t('ext.search.installed')} placeholder={t('ext.search.installed')} value={query} onChange={e=>setQuery(e.target.value)}/><button type="button" className="ext-btn" onClick={()=>setConfirm(true)} disabled={enabledN===0}>{t('ext.disableAll')}</button></div>
  {confirm?<div className="ext-confirm" role="alertdialog" aria-label={t('ext.disableAll.title')}><p><strong>{t('ext.disableAll.title')}</strong> {t('ext.disableAll.body',{count:enabledN})}</p><div className="ext-row"><button type="button" autoFocus className="ext-btn" onClick={()=>setConfirm(false)}>{t('ext.cancel')}</button><button type="button" className="ext-btn ext-btn-danger" onClick={disableAll}>{t('ext.disableAll')}</button></div></div>:null}
  {done&&!confirm?<p role="status" className="ext-status-line">{t('ext.disableAll.done')}</p>:null}
  <InlineError id={id} message={error}/>
  <div className="ext-chips" role="group" aria-label={t('ext.filter.aria')}>{FILTERS.map(f=><button key={f} type="button" aria-pressed={filter===f} className="ext-chip" onClick={()=>setFilter(f)}>{t(`ext.filter.${f}`)}{f==='all'?` ${list.length}`:f==='enabled'?` ${enabledN}`:''}</button>)}</div>
  {shown.length===0?<div className="ext-empty"><h3>{t('ext.search.empty')}</h3><button type="button" className="ext-btn" onClick={()=>{setQuery('');setFilter('all');}}>{t('ext.clearFilters')}</button></div>
   :<ul className="ext-grid" aria-label={t('ext.list.aria')}>{shown.map(e=><ExtensionCard key={e.id} ext={e} host={host} onChanged={onChanged} onOpen={()=>onOpen(e.id)} onOverflow={()=>onOpen(e.id,'permissions')}/>)}</ul>}
 </div>;
}

function GrantRowView({ext,row,host,onChanged}:{ext:PopupExtension;row:GrantRow;host:ExtensionsPopupHost;onChanged:()=>void}){
 const {t}=useT();const [pending,setPending]=useState(false);const {error,setError,id}=useInlineError();const [paths,setPaths]=useState(false);
 const title=row.key==='network'?t('ext.grant.network.title',{host:row.target??''}):row.key==='folders'?(row.target?t('ext.grant.folder.title',{folder:row.target}):t('ext.grant.folders.title')):t(`ext.grant.${row.key}.title`);
 const desc=row.key==='project.read'||row.key==='project.write'||row.key==='folders'&&!row.target?t(`ext.grant.${row.key}.desc`):row.reason??t(`ext.grant.${row.key}.desc`);
 const change=async(on:boolean)=>{setPending(true);setError(null);try{await host.setGrant(ext.id,row.id,on);onChanged();}catch(e){setError(e instanceof Error&&e.message?e.message:t('ext.error.generic'));}finally{setPending(false);}};
 return <li className="ext-grant"><div className="ext-grant-text"><div className="ext-grant-title" id={`g-${row.id}`}>{title}</div><div className="ext-meta" id={`gd-${row.id}`}>{desc}</div>
  {row.key==='network'&&row.paths?.length?<><button type="button" className="ext-link" aria-expanded={paths} onClick={()=>setPaths(p=>!p)}>{t('ext.grant.paths')}</button>{paths?<ul className="ext-paths">{row.paths.map(p=><li key={p}><code>{p}</code></li>)}</ul>:null}</>:null}
  {row.key==='agent'?<div className="ext-meta">{t('ext.grant.agent.cost')}</div>:null}
  {row.control==='toggle'&&!row.granted&&row.required?<div className="ext-meta">{t('ext.grant.requiredOff')}</div>:null}
  <InlineError id={id} message={error}/></div>
  {row.control==='toggle'?<Switch checked={row.granted} busy={pending} label={title} onChange={change}/>:<span className="ext-ask">{row.control==='ask'?t('ext.grant.asks'):t('ext.grant.managed')}</span>}
 </li>;
}

export function ActivityPreview({events,state,onAll}:{events:ActivityEvent[];state:LogState;onAll:()=>void}){
 const {t}=useT();const apiLabel=useApiLabel();const last=sortNewest(events).slice(0,3);
 return <section className="ext-panel" aria-labelledby="ext-act-h"><div className="ext-panel-head"><h3 id="ext-act-h" className="ext-eyebrow">{t('ext.detail.activity')}</h3><button type="button" className="ext-link" onClick={onAll}>{t('ext.viewAll')}</button></div>
  {state.status==='loading'?<p className="ext-meta" role="status">{t('ext.loading')}</p>:state.status==='error'?<p className="ext-error" role="alert">{t('ext.activity.unreadable')}</p>:last.length===0?<p className="ext-meta">{t('ext.activity.none')}</p>
   :<ul className="ext-mini-log">{last.map(e=><li key={e.id}><div><strong>{timeOf(e.ts).slice(0,5)}</strong> {apiLabel(e.api)}</div><div className="ext-meta">{e.target??'-'} · {t(`ext.result.${resultKey(e.decision)}`)}</div></li>)}</ul>}
  <p className="ext-meta">{t('ext.activity.persists')}</p></section>;
}

export function UpdatePanel({ext,host,onChanged}:{ext:PopupExtension;host:ExtensionsPopupHost;onChanged:()=>void}){
 const {t}=useT();const u=ext.update;const [diff,setDiff]=useState<UpdateDiff|null>(null);const [busy,setBusy]=useState(false);const {error,setError,id}=useInlineError();const [checked,setChecked]=useState(false);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError(null);try{await fn();onChanged();}catch(e){setError(e instanceof Error&&e.message?e.message:t('ext.error.generic'));}finally{setBusy(false);}};
 if(diff)return <section className="ext-panel" aria-labelledby="ext-up-h"><h3 id="ext-up-h" className="ext-eyebrow">{t('ext.update.reviewTitle',{version:diff.version})}</h3>
  <p className="ext-meta">{t('ext.update.diffIntro')}</p><ul className="ext-diff">{diff.added.map(c=>{const d=describeChange(c);return <li key={c}>{t(d.key,{arg:d.arg??''})}</li>;})}</ul>
  <InlineError id={id} message={error}/>
  <div className="ext-row"><button type="button" className="ext-btn ext-btn-primary" disabled={busy} onClick={()=>run(async()=>{await host.acceptUpdate(ext.id);setDiff(null);})}>{t('ext.update.accept')}</button><button type="button" className="ext-btn" disabled={busy} onClick={()=>run(async()=>{await host.keepCurrent(ext.id);setDiff(null);})}>{t('ext.update.keep')}</button></div></section>;
 return <section className="ext-panel" aria-labelledby="ext-up-h"><h3 id="ext-up-h" className="ext-eyebrow">{u.kind==='consent'||u.kind==='silent'?t('ext.update.available',{version:u.version}):t('ext.update.title')}</h3>
  {u.kind==='consent'?<><div className="ext-callout"><strong>{t('ext.update.needsOk')}</strong><div>{t('ext.update.added',{summary:u.added.map(c=>{const d=describeChange(c);return t(d.key,{arg:d.arg??''});}).join(', ')})}</div></div>
    <p className="ext-meta">{ext.status==='blocked'?t('ext.update.blockedOld'):u.keepsRunning?t('ext.update.keepsRunning',{version:ext.version}):''}</p>
    <button type="button" className="ext-btn ext-btn-primary" disabled={busy} onClick={()=>run(async()=>setDiff(await host.reviewUpdate(ext.id)))}>{t('ext.update.review')}</button></>
  :u.kind==='silent'?<p className="ext-meta">{t('ext.update.silent')}</p>
  :<><p className="ext-meta" role="status">{u.kind==='checking'?t('ext.update.checking'):u.kind==='error'?t('ext.update.error'):checked?t('ext.update.upToDate',{version:ext.version}):t('ext.update.current',{version:ext.version})}</p>
    <button type="button" className="ext-btn" disabled={busy||u.kind==='checking'} onClick={()=>run(async()=>{await host.checkUpdate(ext.id);setChecked(true);})}>{t('ext.update.check')}</button></>}
  <InlineError id={id} message={error}/></section>;
}

export function DetailView({ext,host,log,focusSection,onBack,onChanged,onActivity,onRemoved}:{ext:PopupExtension;host:ExtensionsPopupHost;log:{events:ActivityEvent[];state:LogState};focusSection?:string;onBack:()=>void;onChanged:()=>void;onActivity:()=>void;onRemoved:()=>void}){
 const {t}=useT();const [pending,setPending]=useState(false);const {error,setError,id}=useInlineError();const [confirm,setConfirm]=useState(false);const [deleteData,setDeleteData]=useState(false);const [copied,setCopied]=useState(false);
 const sw=switchState(ext,pending);const src=ext.source;
 const toggle=async(next:boolean)=>{setPending(true);setError(null);try{await host.setEnabled(ext.id,next);onChanged();}catch(e){setError(e instanceof Error&&e.message?e.message:t('ext.error.generic'));}finally{setPending(false);}};
 const remove=async()=>{try{await host.remove(ext.id,deleteData);onRemoved();}catch(e){setError(e instanceof Error&&e.message?e.message:t('ext.error.generic'));setConfirm(false);}};
 const sensitive=ext.grants;
 return <div className="ext-view ext-detail">
  <div className="ext-detail-head"><button type="button" className="ext-btn" onClick={onBack}>{t('ext.back.installed')}</button>
   <ExtensionIdentity ext={ext} size={40}/>
   <div className="ext-head-actions"><label className="ext-enabled"><span>{ext.enabled?t('ext.enabled'):t('ext.status.disabled')}</span><Switch checked={sw.checked} disabled={!sw.canEnable&&!ext.enabled} busy={pending} label={t(ext.enabled?'ext.switch.disable':'ext.switch.enable',{name:ext.name})} onChange={toggle}/></label><button type="button" className="ext-btn ext-btn-danger-quiet" onClick={()=>setConfirm(true)}>{t('ext.remove')}</button></div></div>
  <InlineError id={id} message={error}/>
  {ext.status==='blocked'||ext.status==='crashed'?<div className="ext-callout" role="status"><strong>{t(ext.status==='blocked'?'ext.status.blocked':'ext.status.crashed')}</strong>{ext.statusReason?<div>{ext.statusReason}</div>:null}</div>:null}
  {confirm?<div className="ext-confirm" role="alertdialog" aria-label={t('ext.remove.title',{name:ext.name})}><p><strong>{t('ext.remove.title',{name:ext.name})}</strong> {t('ext.remove.body')}</p>
    <label className="ext-check"><input type="checkbox" checked={deleteData} onChange={e=>setDeleteData(e.target.checked)}/> {t('ext.remove.deleteData')}</label>
    <div className="ext-row"><button type="button" autoFocus className="ext-btn" onClick={()=>setConfirm(false)}>{t('ext.cancel')}</button><button type="button" className="ext-btn ext-btn-danger" onClick={remove}>{t('ext.remove')}</button></div></div>:null}
  <div className="ext-split">
   <div className="ext-col">
    <section className="ext-panel" aria-labelledby="ext-ab-h"><h3 id="ext-ab-h" className="ext-eyebrow">{t('ext.detail.about')}</h3><p>{ext.description}{ext.publisher?` ${t('ext.by',{publisher:ext.publisher})}`:''}</p>{ext.about?<pre className="ext-fixture">{ext.about}</pre>:null}</section>
    <section className="ext-panel" id="ext-permissions" aria-labelledby="ext-pm-h" tabIndex={focusSection==='permissions'?-1:undefined} ref={el=>{if(el&&focusSection==='permissions')el.focus({preventScroll:false});}}><h3 id="ext-pm-h" className="ext-eyebrow">{t('ext.detail.permissions')}</h3>
     {sensitive.length===0?<p className="ext-meta">{t('ext.grant.none')}</p>:<ul className="ext-grants">{sensitive.map(r=><GrantRowView key={r.id} ext={ext} row={r} host={host} onChanged={onChanged}/>)}</ul>}
     {!sensitive.some(r=>r.key==='network')?<p className="ext-meta">{t('ext.grant.noNetwork')}</p>:null}
     <p className="ext-meta">{t('ext.grant.offWarn')}</p></section>
    <section className="ext-panel" aria-labelledby="ext-src-h"><h3 id="ext-src-h" className="ext-eyebrow">{t('ext.detail.source')}</h3>
     <div>{src.provider}{src.repository?` · ${src.repository}`:''}{src.release?` · ${src.release}`:''}</div>
     {src.sha256?<div className="ext-meta">SHA-256 · {showsSignedMatch(src)?t('ext.source.match'):src.verification==='hash-match'?t('ext.source.hashMatch'):src.verification==='invalid'?t('ext.source.invalid'):t('ext.source.noMatch')}</div>:null}
     {src.sha256?<div className="ext-hash"><code title={src.sha256} aria-label={t('ext.source.hashAria',{hash:src.sha256})}>{shortHash(src.sha256)}</code><button type="button" className="ext-link" onClick={async()=>{try{await host.copyText(src.sha256!);setCopied(true);}catch{setError(t('ext.error.generic'));}}}>{copied?t('ext.source.copied'):t('ext.source.copy')}</button></div>:null}
     {src.url?<button type="button" className="ext-link" onClick={()=>host.openExternal(src.url!)}>{t('ext.source.open')}</button>:null}</section>
   </div>
   <div className="ext-col">
    <ActivityPreview events={log.events} state={log.state} onAll={onActivity}/>
    <UpdatePanel ext={ext} host={host} onChanged={onChanged}/>
   </div>
  </div>
 </div>;
}
