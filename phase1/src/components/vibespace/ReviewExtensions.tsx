import {AcpPanel} from './AcpPanel';
import {ComputerUseReview} from './ComputerUseReview';
import {useEffect,useState,useSyncExternalStore} from 'react';
import {getLocale,subscribeLocale,t} from '../../lib/i18n';
import {costLabel,reviewedHunksAllowed} from '../../lib/vibespace/state';
import type {Studio,VibeSpaceTransport,VibeIntent,ReviewDetails,HunkSelection} from '../../lib/vibespace/types';
import {NativeButton,NativeInput,Textarea} from '../ui/native-controls';
function useText(){useSyncExternalStore(subscribeLocale,getLocale,getLocale);return (key:string)=>t(`vibe.review.${key}`);}
/** Read-only durable native projection. No agent loop, event synthesis or silent fixture fallback. */
export function ReviewExtensions({studio,transport,disabled,onAction}:{studio:Studio;transport:VibeSpaceTransport;disabled:boolean;onAction:(i:VibeIntent)=>Promise<boolean>}){
 const [tab,setTab]=useState<'review'|'acp'>('review');
 const text=useText();const [details,setDetails]=useState<ReviewDetails|null>(null),[error,setError]=useState(false);
 const [selected,setSelected]=useState<Record<string,string[]>>({}),[paths,setPaths]=useState<string[]>([]),[confirm,setConfirm]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;setDetails(null);setError(false);setConfirm(false);setSelected({});setPaths([]);
  if(transport.reviewDetails)void transport.reviewDetails(studio.runId).then(d=>{if(active)setDetails(d);},()=>{if(active)setError(true);});
  return()=>{active=false;};
 },[transport,studio.runId,studio.sequence,studio.review?.revision]);
 const review=studio.review;const exact=details?.revision===review?.revision;
 const hunks:HunkSelection[]=Object.entries(selected).filter(([,ids])=>ids.length).map(([path,hunkIds])=>({path,hunkIds}));
 const allowed=!!details&&reviewedHunksAllowed(studio,details,paths,hunks)&&!disabled&&transport.capabilities.includes('apply-hunks');
 const changeAllowed=!!review&&['ready','conflict'].includes(studio.reviewState)&&!disabled&&transport.capabilities.includes('request-changes');
 return <>
  <div className="vs-actions" role="tablist" aria-label={t('vibespace.acp.ui.dock')}>
   <NativeButton role="tab" aria-selected={tab==='review'} aria-controls="vs-review-dock" id="vs-review-tab" onClick={()=>setTab('review')}>{t('vibespace.acp.ui.reviewTab')}</NativeButton>
   <NativeButton role="tab" aria-selected={tab==='acp'} aria-controls="vs-acp-dock" id="vs-acp-tab" onClick={()=>setTab('acp')}>{t('vibespace.acp.ui.title')}</NativeButton>
  </div>
  <div role="tabpanel" id="vs-acp-dock" aria-labelledby="vs-acp-tab" hidden={tab!=='acp'}>{tab==='acp'&&<AcpPanel disabled={disabled}/>}</div>
  <div role="tabpanel" id="vs-review-dock" aria-labelledby="vs-review-tab" hidden={tab!=='review'}>
  {(studio.pendingConsents.some(c=>c.kind==='desktop')||details?.timeline.some(e=>e.kind.startsWith('computer_use.')))&&<ComputerUseReview/>}
  <section className="vs-card"><h3>{text('pauseTitle')}</h3><p className="vs-muted">{text('pauseGap')}</p><div className="vs-actions"><NativeButton disabled>{text('pause')}</NativeButton><NativeButton disabled>{text('resume')}</NativeButton></div></section>
  {error&&<p role="alert" className="vs-notice">{text('readError')}</p>}
  {review&&transport.reviewDetails&&<section className="vs-card" aria-label={text('hunks')}><h3>{text('hunks')}</h3><p className="vs-muted">{text('finalSelection')}</p>
   {!details&&!error&&<p role="status">{text('loading')}</p>}
   {details&&!exact&&<p role="alert">{text('stale')}</p>}
   {exact&&review.files.map(f=>{const hs=details!.files.find(h=>h.path===f.path)?.hunks??[];return <article className="vs-change" key={f.path}><code>{f.path}</code>
    {hs.length?hs.map((h,i)=><label key={h.id} className="vs-hunk-option"><span><NativeInput aria-label={`${text('includeHunk')} ${i+1} ${f.path}`} type="checkbox" checked={selected[f.path]?.includes(h.id)??false} disabled={disabled||f.conflict} onChange={e=>{setConfirm(false);setSelected(prev=>({...prev,[f.path]:e.target.checked?[...(prev[f.path]??[]),h.id]:(prev[f.path]??[]).filter(id=>id!==h.id)}));}}/> {text('hunk')} {i+1}</span><pre data-copyable>{h.diff}</pre></label>):<label className="vs-hunk-title"><NativeInput type="checkbox" disabled={disabled||f.conflict} checked={paths.includes(f.path)} onChange={e=>{setConfirm(false);setPaths(p=>e.target.checked?[...p,f.path]:p.filter(x=>x!==f.path));}}/>{text('wholeFile')}{f.conflict&&` (${text('conflict')})`}</label>}
    {!f.binary&&f.afterText!==null&&<details><summary>{text('preview')}</summary>{/\.(html?|svg)$/i.test(f.path)?<iframe className="vs-artifact-preview" title={`${text('preview')} ${f.path}`} sandbox="" referrerPolicy="no-referrer" srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">${f.afterText}`}/>:<pre data-copyable>{f.afterText}</pre>}</details>}
   </article>;})}
   {confirm?<div className="vs-confirm" role="group" aria-label={text('confirmTitle')}><p>{text('finalSelection')}</p><div className="vs-actions"><NativeButton className="vs-primary" disabled={!allowed} onClick={()=>void onAction({type:'apply-hunks',runId:studio.runId,reviewRevision:review.revision,paths,hunks}).then(ok=>{if(ok)setConfirm(false);})}>{text('confirmApply')}</NativeButton><NativeButton disabled={disabled} onClick={()=>setConfirm(false)}>{text('cancel')}</NativeButton></div></div>:<NativeButton className="vs-primary" disabled={!allowed} onClick={()=>setConfirm(true)}>{text('applyHunks')}</NativeButton>}
  </section>}
  {review&&<form className="vs-card" aria-label={text('requestChanges')} onSubmit={e=>{e.preventDefault();if(!changeAllowed||!message.trim())return;void onAction({type:'request-changes',runId:studio.runId,reviewRevision:review.revision,message:message.trim()}).then(ok=>{if(ok)setMessage('');});}}><h3>{text('requestChanges')}</h3><p className="vs-muted">{text('newRun')}</p><label>{text('changeMessage')}<Textarea maxLength={2048} rows={3} disabled={!changeAllowed} value={message} onChange={e=>setMessage(e.target.value)}/></label><NativeButton type="submit" disabled={!changeAllowed||!message.trim()}>{text('startNew')}</NativeButton></form>}
  <section className="vs-card" aria-label={text('timeline')}><h3>{text('timeline')}</h3>{details?<ol className="vs-timeline">{details.timeline.map(e=><li key={e.sequence}><div><strong>{(t(`vibe.review.event.${e.kind.replaceAll('.','_')}`).startsWith('vibe.review.')?e.kind:text('event.'+e.kind.replaceAll('.','_')))}</strong>{e.detail&&<span data-copyable>{e.detail}</span>}{e.usage&&<UsageDetails studio={{...studio,usage:e.usage}}/>}<time dateTime={e.timestampUtc}>{new Date(e.timestampUtc).toLocaleString(getLocale())}</time></div><small>#{e.sequence}</small></li>)}</ol>:<p className="vs-muted">{transport.reviewDetails?text('loading'):text('historyUnavailable')}</p>}</section>
  </div>
 </>;
}
export function UsageDetails({studio}:{studio:Studio}){
 const text=useText();const u=studio.usage;if(!u)return null;
 return <details className="vs-usage"><summary>{text('usage')}</summary><dl><dt>{text('input')}</dt><dd>{u.inputTokens.toLocaleString(getLocale())}</dd><dt>{text('output')}</dt><dd>{u.outputTokens.toLocaleString(getLocale())}</dd><dt>{text('cached')}</dt><dd>{u.cacheReadTokens===null?text('unknownSource'):u.cacheReadTokens.toLocaleString(getLocale())}</dd><dt>{text('cacheWrite')}</dt><dd>{u.cacheWriteTokens===null?text('unknownSource'):u.cacheWriteTokens.toLocaleString(getLocale())}</dd>{costLabel(studio)&&<><dt>{text('reportedCost')}</dt><dd>{costLabel(studio)}</dd></>}<dt>{text('source')}</dt><dd>{u.costSource==='provider_reported_partial'?text('partialSource'):u.costSource??text('unknownSource')}</dd></dl></details>;
}
