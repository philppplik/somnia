import {useCallback,useEffect,useRef,useState} from 'react';
import {useT} from '../../lib/useT';
import type {BrowseResult,ExtensionsPopupHost} from '../../lib/extensions/popupHost';
import {activityTabs,canInstall,groupByDay,resultKey,timeOf,toActivityFilter,type CandidateState,type ChipId,type LogState,type PopupExtension} from '../../lib/extensions/popupModel';
import type {ActivityEvent} from '../../lib/extensions/securityActivity';
import {InlineError,Logo,VerifiedBadge,useApiLabel,useInlineError} from './parts';

const ERR_KEYS:Record<string,string>={malformed:'ext.add.err.malformed',wrongType:'ext.add.err.wrongType',unknownPermission:'ext.add.err.unknownPermission',missingEntry:'ext.add.err.missingEntry',unsupportedApp:'ext.add.err.unsupportedApp',badHash:'ext.add.err.badHash',duplicate:'ext.add.err.duplicate',blocked:'ext.add.err.blocked',failed:'ext.add.err.failed'};

export function CandidateReview({c,host,onInstalled}:{c:Extract<CandidateState,{kind:'ready'}>;host:ExtensionsPopupHost;onInstalled:()=>void}){
 const {t}=useT();const [reviewed,setReviewed]=useState(false);const [busy,setBusy]=useState(false);const {error,setError,id}=useInlineError();
 const ok=canInstall(c,host.developerMode(),reviewed);
 const go=async()=>{setBusy(true);setError(null);try{await host.install(c.id);onInstalled();}catch(e){const code=e instanceof Error?e.message:'';if(code==='cancelled'||code==='E_CONSENT_CANCELLED')return;setError(t(code==='blocked'||code==='E_BLOCKLISTED'?'ext.add.err.blocked':code==='changed'||code==='mismatch'?'extConsent.changed':'ext.add.err.failed'));}finally{setBusy(false);}};
 return <section className="ext-panel" aria-labelledby="ext-rv-h"><h3 id="ext-rv-h" className="ext-eyebrow">{t('ext.add.review')}</h3>
  <dl className="ext-dl"><dt>{t('ext.add.identity')}</dt><dd>{c.name} {c.version} <code>{c.id}</code></dd><dt>{t('ext.add.origin')}</dt><dd>{c.origin}</dd><dt>{t('ext.add.engine')}</dt><dd>{c.engine}</dd><dt>{t('ext.add.verification')}</dt><dd>{t(c.verification==='hash-match'?'ext.source.hashMatch':c.verification==='signed-match'?'ext.source.match':c.verification==='invalid'?'ext.source.invalid':'ext.source.noMatch')}</dd></dl>
  {c.native?<div className="ext-callout" role="alert"><strong>{t('ext.add.native.title')}</strong> {host.developerMode()?t('ext.add.native.body'):t('ext.add.native.gate')}</div>:null}
  <h4 className="ext-sub">{t('ext.add.requested')}</h4>
  {c.grants.length===0?<p className="ext-meta">{t('ext.grant.none')}</p>:<ul className="ext-paths">{c.grants.map(g=><li key={g.id}>{g.key==='network'?t('ext.grant.network.title',{host:g.target??''}):t(`ext.grant.${g.key}.title`)}{g.reason?` - ${g.reason}`:''}</li>)}</ul>}
  <label className="ext-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> {t('ext.add.reviewed')}</label>
  <InlineError id={id} message={error}/>
  <button type="button" className="ext-btn ext-btn-primary" disabled={!ok||busy} onClick={go}>{t('ext.add.install')}</button></section>;
}

export function ExtensionCandidateInput({host,onInstalled}:{host:ExtensionsPopupHost;onInstalled:()=>void}){
 const {t}=useT();const [text,setText]=useState('');const [state,setState]=useState<CandidateState>({kind:'empty'});const [hover,setHover]=useState(false);const fileRef=useRef<HTMLInputElement>(null);const folderRef=useRef<HTMLInputElement>(null);
 const inspect=async(manifestText:string,packageName?:string,extra?:{bytes?:Uint8Array;files?:Record<string,Uint8Array>})=>{setState({kind:'inspecting'});try{setState(await host.inspect({manifestText,packageName,...extra}));}catch{setState({kind:'error',code:'failed'});}};
 const onFile=async(files:FileList|File[]|null)=>{const f=files?Array.from(files):[];if(f.length===0)return;const one=f[0];
  if(f.length===1&&!one.name.endsWith('.somniax')&&!one.name.endsWith('.zip')&&!one.name.endsWith('.toml')&&!one.name.endsWith('.json')){setState({kind:'error',code:'wrongType'});return;}
  if(one.name.endsWith('.toml')||one.name.endsWith('.json')){const body=await one.text();setText(body);await inspect(body,one.name);return;}
  if(f.length>1||(one as File&{webkitRelativePath?:string}).webkitRelativePath){
   const files:Record<string,Uint8Array>={};let total=0;
   for(const x of f){total+=x.size;if(total>25*1024*1024){setState({kind:'error',code:'failed'});return;}files[(x as File&{webkitRelativePath?:string}).webkitRelativePath||x.name]=new Uint8Array(await x.arrayBuffer());}
   await inspect('',one.name,{files});return;}
  if(one.size>25*1024*1024){setState({kind:'error',code:'failed'});return;}
  await inspect('',one.name,{bytes:new Uint8Array(await one.arrayBuffer())});};
 const err=state.kind==='error'?state:null;
 return <div className="ext-view ext-add">
  <div className="ext-split">
   <div className="ext-col">
    <div className={`ext-drop${hover?' is-hover':''}`} onDragOver={e=>{e.preventDefault();setHover(true);}} onDragLeave={()=>setHover(false)} onDrop={e=>{e.preventDefault();setHover(false);void onFile(e.dataTransfer.files);}}>
     <h3>{t('ext.add.drop.title')}</h3><p className="ext-meta">{t('ext.add.drop.body')}</p>
     <div className="ext-row"><button type="button" className="ext-btn" onClick={()=>fileRef.current?.click()}>{t('ext.add.chooseFile')}</button><button type="button" className="ext-btn" onClick={()=>folderRef.current?.click()}>{t('ext.add.chooseFolder')}</button></div>
     <input ref={fileRef} type="file" hidden accept=".somniax,.zip,.toml,.json" onChange={e=>{void onFile(e.target.files);e.target.value='';}}/>
     <input ref={folderRef} type="file" hidden {...({webkitdirectory:''} as object)} onChange={e=>{void onFile(e.target.files);e.target.value='';}}/>
    </div>
    <div className="ext-field"><label htmlFor="ext-manifest" className="ext-eyebrow ext-literal">{t('ext.add.manifest.label')}</label>
     <textarea id="ext-manifest" spellCheck={false} value={text} onChange={e=>{setText(e.target.value);if(state.kind!=='empty')setState({kind:'empty'});}} aria-describedby="ext-manifest-state" rows={10}/>
     <div className="ext-row"><button type="button" className="ext-btn ext-btn-primary" disabled={!text.trim()||state.kind==='inspecting'} onClick={()=>inspect(text)}>{t('ext.add.inspect')}</button><span className="ext-meta">{t('ext.add.inspect.note')}</span></div></div>
   </div>
   <div className="ext-col" id="ext-manifest-state" aria-live="polite">
    {state.kind==='inspecting'?<p className="ext-meta">{t('ext.add.inspecting')}</p>:null}
    {err?<div className="ext-callout ext-callout-error" role="alert"><strong>{t(ERR_KEYS[err.code])}</strong>{err.line?<div>{t('ext.add.at',{line:err.line,column:err.column??0})}</div>:null}{err.detail?<div className="ext-meta"><code>{err.detail}</code></div>:null}</div>:null}
    {state.kind==='manifestOnly'?<div className="ext-callout"><strong>{t('ext.add.manifestOnly',{name:state.name,version:state.version})}</strong><div>{t('ext.add.manifestOnly.body')}</div></div>:null}
    {state.kind==='mismatch'?<div className="ext-callout" role="alert"><strong>{t('ext.add.mismatch')}</strong><div className="ext-meta"><code>{state.pastedHash}</code><br/><code>{state.packageHash}</code></div></div>:null}
    {state.kind==='ready'?<CandidateReview c={state} host={host} onInstalled={onInstalled}/>:null}
    {state.kind==='empty'?<section className="ext-panel"><p className="ext-meta">{t('ext.add.hint')}</p></section>:null}
   </div>
  </div></div>;
}

export function BrowseView({host,installedIds,onOpenInstalled,onReviewUpdate,onInstalled}:{host:ExtensionsPopupHost;installedIds:string[];onOpenInstalled:(id:string)=>void;onReviewUpdate:(id:string)=>void;onInstalled:()=>void}){
 const {t}=useT();const [res,setRes]=useState<BrowseResult|null>(null);const [q,setQ]=useState('');const [cat,setCat]=useState('all');const [review,setReview]=useState<CandidateState|null>(null);
 const load=useCallback(()=>{setRes(null);const c=new AbortController();void host.browse(c.signal).then(r=>{if(!c.signal.aborted)setRes(r);});return ()=>c.abort();},[host]);
 useEffect(()=>load(),[load]);
 const openReview=async(id:string)=>{setReview({kind:'inspecting'});setReview(await host.reviewInstall(id));};
 if(review)return <div className="ext-view"><button type="button" className="ext-btn ext-back" onClick={()=>setReview(null)}>{t('ext.back.browse')}</button>{review.kind==='ready'?<CandidateReview c={review} host={host} onInstalled={()=>{setReview(null);onInstalled();}}/>:review.kind==='error'?<div className="ext-callout ext-callout-error" role="alert">{t(ERR_KEYS[review.code])}</div>:<p className="ext-meta">{t('ext.add.inspecting')}</p>}</div>;
 if(!res)return <p className="ext-meta ext-pad" role="status">{t('ext.loading')}</p>;
 if(res.status==='unavailable')return <div className="ext-empty"><h3>{t('ext.browse.unavailable')}</h3><p>{t('ext.browse.unavailable.body')}</p><button type="button" className="ext-btn ext-btn-primary" onClick={load}>{t('ext.retry')}</button></div>;
 const shown=res.entries.filter(e=>(!q||`${e.name} ${e.description}`.toLowerCase().includes(q.toLowerCase())));
 void cat;void setCat;void installedIds;
 return <div className="ext-view"><div className="ext-toolbar"><input type="search" aria-label={t('ext.search.browse')} placeholder={t('ext.search.browse')} value={q} onChange={e=>setQ(e.target.value)}/></div>
  {res.offline&&res.fetchedAt?<p className="ext-callout" role="status">{t('ext.browse.offline',{time:new Date(res.fetchedAt).toLocaleString()})}</p>:null}
  {shown.length===0?<div className="ext-empty"><h3>{t('ext.search.empty')}</h3></div>:<ul className="ext-grid">{shown.map(e=><li key={e.id} className="ext-card ext-card-browse"><div className="ext-card-main-static"><div className="ext-identity"><Logo name={e.name}/><div className="ext-identity-text"><div className="ext-name-row"><h3 className="ext-name">{e.name}</h3>{e.badge?<VerifiedBadge criterion={e.badge.criterion}/>:null}</div><p className="ext-desc">{e.description}</p></div></div></div>
   <div className="ext-card-extra"><div className="ext-tags">{e.permissionLabels.length?e.permissionLabels.map(p=><span key={p} className="ext-tag ext-tag-perm">{t(p==='project.read'?'ext.tag.read':'ext.tag.write')}</span>):<span className="ext-tag ext-tag-ok">{t('ext.tag.none')}</span>}</div>
   {e.state==='available'?<button type="button" className="ext-btn ext-btn-primary" onClick={()=>openReview(e.id)}>{t('ext.browse.reviewInstall')}</button>:e.state==='installed'?<button type="button" className="ext-btn" onClick={()=>onOpenInstalled(e.id)}>{t('ext.browse.installed')}</button>:<button type="button" className="ext-btn ext-btn-primary" onClick={()=>onReviewUpdate(e.id)}>{t('ext.update.review')}</button>}</div></li>)}</ul>}
  <p className="ext-meta ext-foot">{t('ext.browse.footer')}</p></div>;
}

const CHIPS:ChipId[]=['all','allowed','denied','prompts','changes','network'];
export function ExtensionActivityTable({events,tz}:{events:ActivityEvent[];tz?:string}){
 const {t}=useT();const apiLabel=useApiLabel();const [open,setOpen]=useState<string|null>(null);
 return <div role="table" aria-label={t('ext.nav.activity')} className="ext-table">
  <div role="row" className="ext-tr ext-th"><span role="columnheader">{t('ext.col.time')}</span><span role="columnheader">{t('ext.col.extension')}</span><span role="columnheader">{t('ext.col.action')}</span><span role="columnheader">{t('ext.col.target')}</span><span role="columnheader">{t('ext.col.result')}</span></div>
  {groupByDay(events,tz).map(g=><div key={g.day} role="rowgroup"><div className="ext-day">{new Intl.DateTimeFormat(undefined,{dateStyle:'full',timeZone:tz}).format(new Date(g.events[0].ts))}</div>
   {g.events.map(e=><div key={e.id}><div role="row" className="ext-tr"><span role="cell" className="ext-mono" title={e.ts}>{timeOf(e.ts,tz)}</span><span role="cell">{e.extensionName}</span><span role="cell">{apiLabel(e.api)}</span><span role="cell" className="ext-target"><button type="button" className="ext-target-btn" aria-expanded={open===e.id} onClick={()=>setOpen(o=>o===e.id?null:e.id)}>{e.target??'-'}</button></span><span role="cell"><span className={`ext-result ext-result-${resultKey(e.decision)}`}>{t(`ext.result.${resultKey(e.decision)}`)}</span></span></div>
    {open===e.id?<dl className="ext-detail-row ext-dl"><dt>{t('ext.col.target')}</dt><dd>{e.target??'-'}</dd><dt>API</dt><dd><code>{e.api}</code></dd><dt>{t('ext.act.latency')}</dt><dd>{e.latencyMs==null?'-':`${e.latencyMs} ms`}</dd><dt>{t('ext.act.scope')}</dt><dd>{e.scope??'-'}</dd></dl>:null}</div>)}</div>)}
 </div>;
}

export function ActivityView({host,installed,initial,onQueryChange}:{host:ExtensionsPopupHost;installed:PopupExtension[];initial:{extensionId:string|null;chip:ChipId};onQueryChange?:()=>void}){
 const {t}=useT();const [extId,setExtId]=useState<string|null>(initial.extensionId);const [chip,setChip]=useState<ChipId>(initial.chip);const [text,setText]=useState('');
 const [log,setLog]=useState<LogState>({status:'loading'});const [seen,setSeen]=useState<ActivityEvent[]>([]);const chipRef=useRef<HTMLButtonElement>(null);const [msg,setMsg]=useState<string|null>(null);const {error,setError,id}=useInlineError();
 useEffect(()=>{if(initial.chip==='network')chipRef.current?.focus();},[initial.chip]);
 const filter=toActivityFilter({extensionId:extId,chip,text});
 const key=JSON.stringify(filter);
 useEffect(()=>{let live=true;setLog({status:'loading'});host.queryActivity(filter,0,100).then(p=>{if(live){setLog({status:'ready',events:p.events,nextOffset:p.nextOffset,total:p.total});setSeen(s=>{const m=new Map(s.map(e=>[e.id,e]));p.events.forEach(e=>m.set(e.id,e));return [...m.values()];});}}).catch(()=>{if(live)setLog({status:'error'});});return()=>{live=false;};},[host,key]);// eslint-disable-line react-hooks/exhaustive-deps
 const more=async()=>{if(log.status!=='ready'||log.nextOffset==null)return;try{const p=await host.queryActivity(filter,log.nextOffset,100);setLog({status:'ready',events:[...log.events,...p.events],nextOffset:p.nextOffset,total:p.total});}catch{setLog({status:'error'});}};
 const tabs=activityTabs(installed,seen);
 const exportLog=async()=>{setError(null);setMsg(null);try{const p=await host.exportActivity(filter);if(p)setMsg(t('ext.export.done'));}catch(e){setError(e instanceof Error&&e.message?e.message:t('ext.error.generic'));}};
 return <div className="ext-view ext-activity">
  <div className="ext-tabs-scroll" role="tablist" aria-label={t('ext.act.tabs')}>{[{id:null as string|null,name:t('ext.act.all'),removed:false},...tabs].map(x=><button key={x.id??'all'} role="tab" aria-selected={extId===x.id} className="ext-subtab" onClick={()=>setExtId(x.id)}>{x.name}{x.removed?` (${t('ext.act.removed')})`:''}</button>)}</div>
  <div className="ext-toolbar"><input type="search" aria-label={t('ext.search.activity')} placeholder={t('ext.search.activity')} value={text} onChange={e=>setText(e.target.value)}/><button type="button" className="ext-btn" onClick={exportLog}>{t('ext.export')}</button></div>
  <div className="ext-chips" role="group" aria-label={t('ext.filter.aria')}>{CHIPS.map(c=><button key={c} ref={c==='network'?chipRef:undefined} type="button" className="ext-chip" aria-pressed={chip===c} onClick={()=>{setChip(c);onQueryChange?.();}}>{t(`ext.chip.${c}`)}</button>)}</div>
  <InlineError id={id} message={error}/>{msg?<p role="status" className="ext-status-line">{msg}</p>:null}
  {log.status==='loading'?<p className="ext-meta" role="status">{t('ext.loading')}</p>
   :log.status==='error'?<div className="ext-callout ext-callout-error" role="alert"><strong>{t('ext.activity.unreadable')}</strong> {t('ext.activity.unreadable.body')}</div>
   :log.events.length===0?<div className="ext-empty"><h3>{t('ext.activity.none')}</h3></div>
   :<><ExtensionActivityTable events={log.events}/>{log.nextOffset!=null?<button type="button" className="ext-btn" onClick={more}>{t('ext.act.more',{shown:log.events.length,total:log.total})}</button>:null}</>}
  <p className="ext-meta ext-foot">{t('ext.act.footer')}</p></div>;
}
