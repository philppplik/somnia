import {useEffect,useState} from 'react';
import {useT} from '../../lib/useT';
import type {ConcernCategory,StoreHost} from '../../lib/extensions/storeHost';
import type {StoreCard} from '../../lib/extensions/storeView';
import {StoreModal,TabList} from './StoreParts';

const CATS:ConcernCategory[]=['security','impersonation','misleading','other'];
type Route='private'|'public';
/** Report a concern. Private route sends only the disclosed fields; the public route opens the index issue form and sends nothing itself. */
export function ReportConcern({card,store,open,onClose,openExternal}:{card:StoreCard;store:StoreHost;open:boolean;onClose:()=>void;openExternal:(url:string)=>Promise<void>}){
 const {t}=useT();const [route,setRoute]=useState<Route>('private');const [cat,setCat]=useState<ConcernCategory>('security');const [text,setText]=useState('');
 const [attach,setAttach]=useState(false);const [log,setLog]=useState<string|null|undefined>(undefined);const [busy,setBusy]=useState(false);const [error,setError]=useState(false);const [ref,setRef]=useState<string|null>(null);
 useEffect(()=>{if(!open){setRoute('private');setCat('security');setText('');setAttach(false);setLog(undefined);setBusy(false);setError(false);setRef(null);}},[open]);
 useEffect(()=>{if(!attach||log!==undefined)return;let live=true;void store.errorLog(card.id).then(l=>{if(live)setLog(l);}).catch(()=>{if(live)setLog(null);});return()=>{live=false;};},[attach,log,store,card.id]);
 const r=card.release;
 const send=async()=>{setBusy(true);setError(false);try{const res=await store.submitReport({extensionId:card.id,version:r.version,artifactSha256:r.artifact.sha256,somniaVersion:store.somniaVersion(),category:cat,text:text.trim(),...(attach&&log?{errorLog:log}:{})});setRef(res.reference);}catch{setError(true);}finally{setBusy(false);}};
 const title=t('store.report.title');
 const sub=`${card.name} · v${r.version} · ${card.publisherName}`;
 return <StoreModal open={open} onClose={onClose} title={title} subtitle={sub}>
  {ref!==null?<div className="store-report-done" role="status"><h3>{t('store.report.done')}</h3><p>{t('store.report.done.body',{reference:ref})}</p><div className="store-modal-foot"><button type="button" className="ext-btn ext-btn-primary" onClick={onClose}>{t('store.close')}</button></div></div>
  :<>
   <TabList idPrefix="store-report" label={t('store.report.tabs')} value={route} onChange={setRoute} tabs={[{id:'private',label:t('store.report.tab.private')},{id:'public',label:t('store.report.tab.public')}]}/>
   <div id="store-report-panel" role="tabpanel" aria-labelledby={`store-report-tab-${route}`} className="store-report-body">
    {route==='private'?<>
     <fieldset className="store-radios"><legend className="sr-only">{t('store.report.category')}</legend>{CATS.map(c=><label key={c} className={`store-radio${cat===c?' is-on':''}`}><input type="radio" name="store-concern" value={c} checked={cat===c} onChange={()=>setCat(c)}/><span><strong>{t(`store.report.${c}.title`)}</strong><span className="store-radio-body">{t(`store.report.${c}.body`)}</span></span></label>)}</fieldset>
     <textarea className="store-textarea" aria-label={t('store.report.text')} placeholder={t('store.report.text.placeholder')} value={text} maxLength={2000} onChange={e=>setText(e.target.value)}/>
     <div className="store-disclose"><p><strong>{t('store.report.sent.label')}</strong> {t('store.report.sent.body')}</p>
      <label className="ext-check"><input type="checkbox" checked={attach} onChange={e=>setAttach(e.target.checked)}/> {t('store.report.attach')}</label>
      {attach?log===undefined?<p className="ext-meta" role="status">{t('store.loading')}</p>:log===null?<p className="ext-meta">{t('store.report.log.empty')}</p>:<><p className="ext-meta">{t('store.report.log.preview')}</p><pre className="store-log" tabIndex={0} aria-label={t('store.report.log.preview')}>{log}</pre></>:null}</div>
     {error?<p role="alert" className="ext-error">{t('store.report.failed')}</p>:null}
     <div className="store-modal-foot"><p className="store-reply">{t('store.report.reply')}</p><div className="ext-row"><button type="button" className="ext-btn" onClick={onClose}>{t('store.report.cancel')}</button><button type="button" className="ext-btn ext-btn-primary" disabled={busy} onClick={send}>{busy?t('store.report.sending'):t('store.report.send')}</button></div></div>
    </>:<>
     <p>{t('store.report.public.body')}</p><p className="ext-meta">{t('store.report.public.note')}</p>
     <div className="store-modal-foot"><p className="store-reply">{t('store.report.reply')}</p><div className="ext-row"><button type="button" className="ext-btn" onClick={onClose}>{t('store.report.cancel')}</button><button type="button" className="ext-btn ext-btn-primary" onClick={()=>{void openExternal(store.publicIssueUrl(card.id,r.version));}}>{t('store.report.public.open')}</button></div></div>
    </>}
   </div></>}
 </StoreModal>;
}
