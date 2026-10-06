import {useEffect,useMemo,useRef,useState} from 'react';
import {fetchCatalog,reviewCatalogPackage,installReviewedPackage,type CatalogEntry,type ReviewedPackage} from '../lib/extensions/catalog';
import {loadExtensions} from '../lib/extensions/registry';
import {CATEGORIES,DEFAULT_FILTER,categoryCounts,categoryOf,catalogErrorCode,filterEntries,installStateOf,updatesAvailable,type CatalogFilter,type StatusFilter} from '../lib/extensions/catalogView';
import {useT} from '../lib/useT';

const statuses:StatusFilter[]=['all','not-installed','installed','update-available'];

/** No background fetch. Opening Browse is an explicit opt-in to contact GitHub. */
export function ExtensionCatalog({onInstalled}:{onInstalled:()=>void}){const {t}=useT();
 const [open,setOpen]=useState(false),[entries,setEntries]=useState<CatalogEntry[]|null>(null),[filter,setFilter]=useState<CatalogFilter>(DEFAULT_FILTER);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[review,setReview]=useState<ReviewedPackage|null>(null);
 const [detailId,setDetailId]=useState<string|null>(null),[installed,setInstalled]=useState(loadExtensions);
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>{request.current?.abort();},[]);
 const patch=(p:Partial<CatalogFilter>)=>setFilter(f=>({...f,...p}));
 const start=()=>{request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');setMessage('');return controller;};
 const fail=(controller:AbortController,e:unknown,fallback:string)=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:fallback);};
 const load=async()=>{setOpen(true);setReview(null);const controller=start();try{setEntries(await fetchCatalog(controller.signal));setInstalled(loadExtensions());}catch(e){fail(controller,e,t('finish.catalog.loadFailed'));}finally{if(!controller.signal.aborted)setBusy(false);}};
 const inspect=async(entry:CatalogEntry)=>{setReview(null);const controller=start();try{setReview(await reviewCatalogPackage(entry,controller.signal));}catch(e){fail(controller,e,t('finish.catalog.verifyFailed'));}finally{if(!controller.signal.aborted)setBusy(false);}};
 const close=()=>{request.current?.abort();setOpen(false);setBusy(false);setReview(null);setError('');setDetailId(null);setFilter(DEFAULT_FILTER);};
 const visible=useMemo(()=>entries?filterEntries(entries,installed,filter):[],[entries,installed,filter]);
 const counts=useMemo(()=>entries?categoryCounts(entries):null,[entries]);
 const updates=entries?updatesAvailable(entries,installed):0;
 const detail=entries?.find(e=>e.id===detailId)??null;
 const filtering=filter.query.trim()!==''||filter.category!=='all'||filter.status!=='all'||filter.noPermissionsOnly;
 const err=error?catalogErrorCode(error):null;

 const badge=(entry:CatalogEntry)=>{const s=installStateOf(entry,installed);return <small data-state={s.state} className="rounded border border-line px-1">{t('finish.catalog.state.'+s.state)}{s.state==='update-available'&&s.installedVersion?t('finish.catalog.versions',{from:s.installedVersion,to:entry.version}):''}{s.state==='installed'||s.state==='newer-installed'?` v${s.installedVersion}`:''}</small>;};
 const reviewButton=(entry:CatalogEntry)=>{const s=installStateOf(entry,installed).state;return <button disabled={busy} aria-label={t('finish.catalog.review',{name:entry.name})} onClick={()=>void inspect(entry)}>{t('finish.catalog.action.'+s)}</button>;};

 return <div className="mb-5 rounded-lg border border-line p-3" aria-label={t('rest.extensionCatalog.githubExtensionCatalog')}>
  <h3 className="mt-0 text-sm">{t('finish.catalog.title')}</h3>
  <p className="text-[12px]">{t('finish.catalog.intro')}</p>
  {!open?<button onClick={()=>void load()}>{t('rest.extensionCatalog.browseGithubExtensions')}</button>:<>
   <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void load()}>{t('rest.extensionCatalog.refreshIndex')}</button><button onClick={close}>{t('rest.extensionCatalog.closeBrowser')}</button></div>
   {busy&&<p role="status">{t('finish.catalog.loading')}</p>}
   {entries&&!detail&&<>
    {updates>0&&<p className="text-[12px]" data-testid="update-banner"><strong>{t('finish.catalog.updates',{count:updates})}</strong> {t('finish.catalog.updateHint')}</p>}
    {entries.length>0&&<>
     <label className="!block">{t('rest.extensionCatalog.searchExtensions')}<input aria-label={t('rest.extensionCatalog.searchExtensions')} className="min-w-0 w-full rounded border border-line bg-panel p-2" value={filter.query} onChange={e=>patch({query:e.target.value})}/></label>
     <div role="group" aria-label={t('rest.extensionCatalog.filterByCategory')} className="my-2 flex flex-wrap gap-2">
      <button aria-pressed={filter.category==='all'} onClick={()=>patch({category:'all'})}>{t('finish.catalog.status.all')} ({entries.length})</button>
      {CATEGORIES.filter(c=>counts&&counts[c]>0).map(c=><button key={c} aria-pressed={filter.category===c} onClick={()=>patch({category:c})}>{t('finish.catalog.category.'+c)} ({counts![c]})</button>)}
     </div>
     <div className="my-2 flex flex-wrap items-center gap-3">
      <label className="text-[12px]">{t('finish.catalog.status')} <select aria-label={t('rest.extensionCatalog.filterByStatus')} value={filter.status} onChange={e=>patch({status:e.target.value as StatusFilter})}>{statuses.map(v=><option key={v} value={v}>{t((v==='all'||v==='update-available'?'finish.catalog.status.':'finish.catalog.state.')+v)}</option>)}</select></label>
      <label className="text-[12px]"><input type="checkbox" checked={filter.noPermissionsOnly} onChange={e=>patch({noPermissionsOnly:e.target.checked})}/> {t('finish.catalog.noPermissions')}</label>
      {filtering&&<button onClick={()=>setFilter(DEFAULT_FILTER)}>{t('rest.extensionCatalog.clearFilters')}</button>}
     </div>
     <p className="text-[12px]" role="status" aria-live="polite">{t('finish.catalog.visible',{visible:visible.length,count:entries.length})}</p>
    </>}
    <ul className="max-h-[260px] list-none overflow-auto p-0" aria-label={t('rest.extensionCatalog.availableExtensions')}>{visible.map(entry=><li key={entry.id} className="my-2 rounded border border-line p-3">
     <strong className="break-words">{entry.name}</strong> <small>{t('finish.catalog.by',{version:entry.version,author:entry.author})}</small> {badge(entry)} <small>{t('finish.catalog.category.'+categoryOf(entry))}</small>
     <p className="my-1 text-[12px] break-words">{entry.description}</p>
     <div className="mt-2 flex flex-wrap gap-3"><button aria-label={t('finish.catalog.details',{name:entry.name})} onClick={()=>{setDetailId(entry.id);setReview(null);setMessage('');}}>{t('rest.extensionCatalog.details')}</button>{reviewButton(entry)}</div>
    </li>)}</ul>
    {entries.length===0&&<p>{t('finish.catalog.empty')}</p>}
    {entries.length>0&&visible.length===0&&<p>{t('finish.catalog.noMatches')} <button onClick={()=>setFilter(DEFAULT_FILTER)}>{t('rest.extensionCatalog.clearFilters')}</button></p>}
   </>}
   {detail&&<section aria-label={t('rest.extensionCatalog.extensionDetails')} className="rounded-lg border border-line p-3">
    <button onClick={()=>{setDetailId(null);setReview(null);}}>{t('rest.extensionCatalog.backToList')}</button>
    <h4 className="break-words">{detail.name} <small>v{detail.version}</small></h4>
    <p className="text-[12px]">{badge(detail)}</p>
    <p className="text-[12px] break-words">{detail.description}</p>
    <dl className="text-[12px]"><dt>{t('rest.extensionCatalog.author')}</dt><dd>{detail.author}</dd><dt>{t('rest.extensionCatalog.category')}</dt><dd>{t('finish.catalog.category.'+categoryOf(detail))}</dd><dt>{t('rest.extensionCatalog.extensionId')}</dt><dd><code>{detail.id}</code></dd><dt>{t('finish.catalog.apiVersion')}</dt><dd>{detail.apiVersion}</dd><dt>{t('finish.catalog.hash')}</dt><dd><code className="break-all">{detail.sha256}</code></dd></dl>
    <strong className="text-[12px]">{t('rest.extensionCatalog.requestedPermissions')}</strong>
    {detail.permissions.length?<ul className="pl-5 text-[12px]">{detail.permissions.map(p=><li key={p}><code>{p}</code>: {t('finish.catalog.permission.'+p)}</li>)}</ul>:<p className="text-[12px]">{t('finish.catalog.noHostPermissions')}</p>}
    <div className="flex flex-wrap gap-3"><a className="text-[12px] underline" href={detail.repo} target="_blank" rel="noreferrer">{t('rest.extensionCatalog.sourceOnGithub')}</a>{reviewButton(detail)}</div>
   </section>}
   {review&&<div className="rounded-lg border border-accent p-3" role="region" aria-label={t('rest.extensionCatalog.reviewExtensionInstall')}><h4 className="mt-0">{t('finish.catalog.installTitle',{name:review.manifest.name,version:review.manifest.version})}</h4><p className="text-[12px]">{t('finish.catalog.hashWarning')}</p><strong className="text-[12px]">{t('rest.extensionCatalog.requestedPermissions')}</strong>{review.manifest.permissions.length?<ul className="pl-5 text-[12px]">{review.manifest.permissions.map(p=><li key={p}><code>{p}</code>: {t('finish.catalog.permission.'+p)}</li>)}</ul>:<p className="text-[12px]">{t('finish.catalog.noHostPermissions')}</p>}<p className="text-[12px]">{t('finish.catalog.installHint')}</p><div className="flex gap-2"><button onClick={()=>{try{const r=installReviewedPackage(review);if(!r.ok){setError(r.errors.join(' '));return;}setMessage(r.manifest.name);setReview(null);setInstalled(loadExtensions());onInstalled();}catch(e){setError(e instanceof Error?e.message:t('finish.catalog.installFailed'));}}}>{t('rest.extensionCatalog.confirmInstall')}</button><button onClick={()=>setReview(null)}>{t('rest.extensionCatalog.cancelInstall')}</button></div></div>}
  </>}
  {err&&<div role="alert" className="text-[12px] break-words"><strong>{t('finish.catalog.error.'+err+'.title')}</strong> {t('finish.catalog.error.'+err+'.hint')}<br/><small>{t('finish.catalog.errorDetails',{error})}</small><br/>{t('finish.catalog.localAvailable')}{open&&!entries&&!busy&&<> <button onClick={()=>void load()}>{t('rest.extensionCatalog.tryAgain')}</button></>}</div>}
  {message&&<p role="status" className="text-[12px]">{t('finish.catalog.installedMessage',{name:message})}</p>}
 </div>;
}
