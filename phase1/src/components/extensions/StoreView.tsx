import {useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowLeft,Download,Flag,Info,Search} from 'lucide-react';
import {useT} from '../../lib/useT';
import type {ExtensionsPopupHost} from '../../lib/extensions/popupHost';
import type {PopupExtension} from '../../lib/extensions/popupModel';
import type {StoreHost,StoreLoad} from '../../lib/extensions/storeHost';
import type {ReleaseEvidence} from '../../lib/extensions/store';
import {requestConsentReview} from '../../lib/extensions/consentUiHost';
import {accessRows,buildCards,candidateBound,categoriesOf,evidenceRows,filterCards,installPaused,publisherIndicators,shortDigest,compareVersions,type StoreCard} from '../../lib/extensions/storeView';
import {AccessTags,CannotRow,EvidenceList,PermissionRowItem,StatusChip,StoreBadge,StoreLogo,TabList,fmtDate} from './StoreParts';
import {VerifiedExplainer} from './VerifiedExplainer';
import {ReportConcern} from './ReportConcern';
import {chipFor} from '../../lib/extensions/storeView';
import {REQUIRED_GATES} from '../../lib/extensions/store';

type Tab='overview'|'access'|'evidence'|'versions'|'privacy';
type Err={id:string;key:string}|null;

export function useStoreSnapshot(store:StoreHost){
 const [res,setRes]=useState<StoreLoad|null>(null);
 const load=useCallback(()=>{setRes(null);const c=new AbortController();void store.load(c.signal).then(r=>{if(!c.signal.aborted)setRes(r);}).catch(()=>{if(!c.signal.aborted)setRes({status:'unavailable'});});return()=>c.abort();},[store]);
 useEffect(()=>load(),[load]);
 return {res,reload:load};
}

/** Store browse and detail in one component so search, category and scroll context survive opening a detail page. */
export function StoreScreen({host,store,installed,detailId,onOpen,onOpenInstalled,onBack,onActivity,onChanged}:{host:ExtensionsPopupHost;store:StoreHost;installed:PopupExtension[];detailId:string|null;onOpen:(id:string)=>void;onOpenInstalled:(id:string)=>void;onBack:()=>void;onActivity:(extensionId:string)=>void;onChanged:()=>void}){
 const {t}=useT();const {res,reload}=useStoreSnapshot(store);
 const [q,setQ]=useState('');const [cat,setCat]=useState('all');const [err,setErr]=useState<Err>(null);const [busy,setBusy]=useState<string|null>(null);const [explain,setExplain]=useState(false);
 const now=store.now?.()??Date.now();
 const map=useMemo(()=>new Map(installed.map(e=>[e.id,e.version])),[installed]);
 const snap=res?.status==='ready'?res.snapshot:null;
 const cards=useMemo(()=>snap?buildCards(snap.catalog,snap.feed,map,now):[],[snap,map,now]);
 const paused=installPaused(snap?.lastTrustedCheck??null,now);

 const start=async(card:StoreCard,mode:'install'|'update')=>{
  setBusy(card.id);setErr(null);
  try{
   const r=await store.stage(card.id,card.release.version,card.release.artifact.sha256,mode);
   if(r.kind==='error'){setErr({id:card.id,key:`store.err.${r.code}`});return;}
   const c=r.request.candidate;
   if(!candidateBound(c,card.release)||(mode==='update'&&(!c.previous||c.previous.version!==card.installedVersion))){setErr({id:card.id,key:'store.err.mismatch'});return;}
   const bind=async(n:typeof c)=>{if(!candidateBound(n,card.release))throw new Error('candidate changed');return n;};
   requestConsentReview({candidate:c,revalidate:async()=>bind(await r.request.revalidate()),commit:async(n,approve)=>{await bind(n);await r.request.commit(n,approve);onChanged();},onClose:()=>onChanged(),onActivity:id=>onActivity(id)});
  }catch{setErr({id:card.id,key:'store.err.failed'});}finally{setBusy(null);}
 };
 const act={start,busy,err,paused,onOpenInstalled};
 if(!res)return <p className="ext-meta ext-pad" role="status">{t('store.loading')}</p>;
 if(!snap)return <div className="ext-empty"><h3>{t('store.unavailable')}</h3><p>{t('store.unavailable.body')}</p><button type="button" className="ext-btn ext-btn-primary" onClick={reload}>{t('store.retry')}</button></div>;
 const detail=detailId?cards.find(c=>c.id===detailId)??null:null;
 return <>
  {detailId?(detail?<StoreDetail key={detail.id} card={detail} store={store} host={host} snapshot={snap} now={now} act={act} onBack={onBack} onExplain={()=>setExplain(true)}/>:<div className="ext-empty"><h3>{t('ext.detail.gone')}</h3><button type="button" className="ext-btn" onClick={onBack}>{t('store.back')}</button></div>)
  :<StoreBrowse cards={cards} offline={snap.offline} fetchedAt={snap.fetchedAt} q={q} setQ={setQ} cat={cat} setCat={setCat} onOpen={onOpen} act={act} onExplain={()=>setExplain(true)}/>}
  <VerifiedExplainer open={explain} onClose={()=>setExplain(false)}/>
 </>;
}
interface Act{start:(c:StoreCard,m:'install'|'update')=>Promise<void>;busy:string|null;err:Err;paused:boolean;onOpenInstalled:(id:string)=>void}

function ActionButton({card,act,large=false}:{card:StoreCard;act:Act;large?:boolean}){
 const {t}=useT();const cls=`ext-btn${large?' store-btn-lg':''}`;const working=act.busy===card.id;
 if(card.state==='blocked')return <button type="button" className={`${cls} store-btn-blocked`} disabled>{t('store.blocked')}</button>;
 if(card.state==='installed')return <button type="button" className={`${cls} store-btn-installed`} onClick={()=>act.onOpenInstalled(card.id)}>{t('store.installed')}</button>;
 const mode=card.state==='update'?'update':'install';const off=act.paused||card.unknownPermission||working;
 return <button type="button" className={`${cls} ext-btn-primary`} disabled={off} aria-describedby={act.paused?'store-paused':undefined} onClick={()=>void act.start(card,mode)}>{large&&mode==='install'?<Download size={16} aria-hidden="true"/>:null}{working?t('store.preparing'):mode==='update'?t('store.update'):t('store.install')}</button>;
}
function StoreBrowse({cards,offline,fetchedAt,q,setQ,cat,setCat,onOpen,act,onExplain}:{cards:StoreCard[];offline:boolean;fetchedAt:string|null;q:string;setQ:(v:string)=>void;cat:string;setCat:(v:string)=>void;onOpen:(id:string)=>void;act:Act;onExplain:()=>void}){
 const {t,locale}=useT();const cats=useMemo(()=>categoriesOf(cards),[cards]);
 const shown=filterCards(cards,q,cat,t);
 return <div className="ext-view store-view">
  <div className="store-searchrow"><label className="store-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label={t('store.search')} placeholder={t('store.search')} value={q} onChange={e=>setQ(e.target.value)}/></label></div>
  {cats.length>0?<div className="ext-chips" role="group" aria-label={t('store.cat.aria')}>{['all',...cats].map(c=><button key={c} type="button" className="ext-chip" aria-pressed={cat===c} onClick={()=>setCat(c)}>{c==='all'?t('store.cat.all'):c}</button>)}</div>:null}
  {offline&&fetchedAt?<p className="ext-callout" role="status">{t('store.offline',{date:fmtDate(fetchedAt,locale)})}</p>:null}
  {act.paused?<p id="store-paused" className="ext-callout" role="status">{t('store.paused')}</p>:null}
  {shown.length===0?<div className="ext-empty"><h3>{t('store.empty')}</h3></div>
  :<section aria-labelledby="store-all-h"><h3 id="store-all-h" className="store-section">{t('store.section.all')}</h3>
   <ul className="store-grid">{shown.map(c=><StoreCardItem key={c.id} card={c} act={act} onOpen={onOpen} onExplain={onExplain}/>)}</ul></section>}
  <p className="ext-meta ext-foot">{t('store.footer')} <button type="button" className="ext-link" onClick={onExplain}>{t('store.footer.link')}</button></p>
 </div>;
}
function StoreCardItem({card,act,onOpen,onExplain}:{card:StoreCard;act:Act;onOpen:(id:string)=>void;onExplain:()=>void}){
 const {t}=useT();const e=act.err?.id===card.id?act.err:null;
 return <li className="store-card" data-state={card.state}>
  <div className="store-card-head"><StoreLogo card={card}/><div className="store-card-id"><div className="ext-name-row"><button type="button" className="store-card-open" aria-label={t('store.openAria',{name:card.name})} onClick={()=>onOpen(card.id)}><h3 className="ext-name">{card.name}</h3></button>{card.verified?<StoreBadge onExplain={onExplain}/>:<span className="store-tag" title={t('store.unreviewed.body')}>{t('store.unreviewed')}</span>}{card.deprecated?<span className="store-tag store-tag-amber">{t('store.deprecated')}</span>:null}</div><p className="ext-meta">{card.publisherName}</p></div></div>
  <p className="store-card-desc">{card.summary}</p>
  <AccessTags card={card}/>
  <div className="store-card-foot"><span className="ext-version">v{card.release.version}</span><ActionButton card={card} act={act}/></div>
  {e?<p role="alert" className="ext-error">{t(e.key)}</p>:null}
 </li>;
}
function StoreDetail({card,store,host,snapshot,now,act,onBack,onExplain}:{card:StoreCard;store:StoreHost;host:ExtensionsPopupHost;snapshot:NonNullable<ReturnType<typeof useStoreSnapshot>['res']> extends infer R?R extends {status:'ready';snapshot:infer S}?S:never:never;now:number;act:Act;onBack:()=>void;onExplain:()=>void}){
 const {t,locale}=useT();const [tab,setTab]=useState<Tab>('access');const [ev,setEv]=useState<ReleaseEvidence|null|undefined>(undefined);const [report,setReport]=useState(false);
 const r=card.release;
 useEffect(()=>{let live=true;setEv(undefined);void store.evidence(card.id,r.version).then(x=>{if(live)setEv(x);}).catch(()=>{if(live)setEv(null);});return()=>{live=false;};},[store,card.id,r.version]);
 const rows=useMemo(()=>evidenceRows(r,ev??null,snapshot.catalog.policyRevision,now,snapshot.lastTrustedCheck),[r,ev,snapshot,now]);
 const access=accessRows(r);const pub=card.publisher;const ind=pub?publisherIndicators(pub,now):null;
 const e=act.err?.id===card.id?act.err:null;
 const open=(u:string)=>{void host.openExternal(u);};
 const tabs:{id:Tab;label:string}[]=[{id:'overview',label:t('store.tab.overview')},{id:'access',label:t('store.tab.access')},{id:'evidence',label:t('store.tab.evidence')},{id:'versions',label:t('store.tab.versions')},{id:'privacy',label:t('store.tab.privacy')}];
 const meta=[card.publisherName,card.verified&&pub?.domain?pub.domain.name:null,t('store.header.version',{version:r.version}),t('store.header.size',{size:Math.round(r.artifact.bytes/1024)})].filter(Boolean).join(' · ');
 return <div className="store-detail">
  <button type="button" className="store-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true"/>{t('store.back')}</button>
  <header className="store-dhead"><StoreLogo card={card} size={72}/><div className="store-dhead-id"><div className="ext-name-row"><h2 className="store-dname">{card.name}</h2>{card.verified?<StoreBadge size={22} onExplain={onExplain}/>:<span className="store-tag" title={t('store.unreviewed.body')}>{t('store.unreviewed')}</span>}{card.official?<span className="store-tag store-tag-official">{t('store.official')}</span>:null}</div><p className="ext-meta">{meta}</p></div><ActionButton card={card} act={act} large/></header>
  {e?<p role="alert" className="ext-error">{t(e.key)}</p>:null}
  {card.state==='blocked'?<p className="store-banner store-banner-red" role="status">{t('store.banner.blocked')}</p>:card.deprecated?<p className="store-banner store-banner-amber" role="status">{t('store.banner.deprecated')}</p>:null}
  {act.paused?<p id="store-paused" className="ext-callout" role="status">{t('store.paused')}</p>:null}
  <div className="store-dcols">
   <div className="store-dmain">
    <TabList idPrefix="store-d" label={t('store.tabs.aria')} value={tab} onChange={setTab} tabs={tabs}/>
    <div id="store-d-panel" role="tabpanel" aria-labelledby={`store-d-tab-${tab}`} className="store-panel">
     {tab==='access'?<>
      <h3 className="store-ph">{t('store.access.title',{name:card.name})}</h3><p className="ext-meta">{t('store.access.sub')}</p>
      {access.length===0?<p className="store-perm-body">{t('store.access.none')}</p>:null}
      <ul className="store-perms">{access.map(a=><PermissionRowItem key={a.id} row={a}/>)}<CannotRow/></ul>
      {card.unknownPermission?<p className="ext-callout ext-callout-error" role="alert">{t('store.access.unknownBlocked')}</p>:null}
     </>:null}
     {tab==='overview'?<>
      <p className="store-lead">{card.summary}</p>
      <dl className="ext-dl"><dt>{t('store.ov.category')}</dt><dd>{card.category}</dd><dt>{t('store.ov.package')}</dt><dd>{t('store.header.size',{size:Math.round(r.artifact.bytes/1024)})} · {t('store.ov.files',{count:r.artifact.fileCount})}</dd><dt>Somnia</dt><dd>{t('store.ov.minSomnia',{version:r.minSomnia})}</dd><dt>{t('store.ov.source')}</dt><dd><button type="button" className="ext-link" onClick={()=>open(r.source.url)}>{r.source.url.replace(/^https:\/\//,'')}</button></dd></dl>
      <h4 className="ext-sub">{t('store.ov.docs')}</h4><ul className="store-links">{(['readme','license','changelog','thirdPartyNotices','security'] as const).map(k=><li key={k}><button type="button" className="ext-link" onClick={()=>open(r.docs[k])}>{t(`store.doc.${k}`)}</button></li>)}</ul>
     </>:null}
     {tab==='evidence'?<>
      <h3 className="store-ph">{t('store.ev.title',{version:r.version})}</h3>
      <EvidenceList rows={rows} now={now} lastTrustedCheck={snapshot.lastTrustedCheck} hasEvidence={!!ev}/>
      <h4 className="ext-sub">{t('store.ev.gates')}</h4>
      <ul className="store-ev">{REQUIRED_GATES.map(g=>{const x=ev?.gates.find(y=>y.gate===g&&y.packageSha256===r.artifact.sha256);const s=x?x.status:'not-run';const c=chipFor(s,'scan');return <li key={g} className="store-ev-row"><div><p className="store-ev-title">{t(`store.gate.${g}`)}</p><p className="store-ev-detail">{x?`${x.tool} ${x.toolVersion} · ${fmtDate(x.scannedAt,locale)}`:t('store.ev.none')}</p></div><StatusChip tone={c.tone}>{t(c.key)}</StatusChip></li>;})}</ul>
      <h4 className="ext-sub">{t('store.ev.reviews')}</h4>{ev&&ev.reviews.length?<p className="ext-meta">{t('store.ev.review',{count:new Set(ev.reviews.map(x=>x.reviewerId)).size,policy:ev.policyRevision})}</p>:<p className="ext-meta">{t('store.ev.noReviews')}</p>}
      <h4 className="ext-sub">{t('store.ev.digests')}</h4>
      <dl className="ext-dl"><dt>{t('store.ev.package')}</dt><dd className="ext-mono">sha256:{r.artifact.sha256}</dd><dt>{t('store.ev.commit')}</dt><dd className="ext-mono">{r.source.commit}</dd><dt>{t('store.ev.policy')}</dt><dd>{snapshot.catalog.policyRevision}</dd></dl>
     </>:null}
     {tab==='versions'?<>
      <h3 className="store-ph">{t('store.ver.title')}</h3>
      <ul className="store-vers">{[...card.listing.releases].sort((a,b)=>compareVersions(b.version,a.version)).map(v=><li key={v.version} className="store-ver"><strong>v{v.version}</strong><span className="ext-meta">{v.channel==='stable'?t('store.ver.stable'):t('store.ver.prerelease')} · {['listed','deprecated','security-blocked'].includes(v.state)?t(`store.state.${v.state}`):t('store.state.other')}</span>{v.version===r.version?<span className="store-tag">{t('store.ver.current')}</span>:null}{v.version===card.installedVersion?<span className="store-tag store-tag-official">{t('store.ver.installed')}</span>:null}</li>)}</ul>
     </>:null}
     {tab==='privacy'?<>
      <h3 className="store-ph">{t('store.priv.title')}</h3>
      <dl className="ext-dl"><dt>{t('store.priv.local')}</dt><dd>{r.dataHandling.localStorage}</dd><dt>{t('store.priv.retention')}</dt><dd>{r.dataHandling.retention}</dd><dt>{t('store.priv.deletion')}</dt><dd>{r.dataHandling.deletion}</dd>{r.dataHandling.remoteProcessors.length?<><dt>{t('store.priv.remote')}</dt><dd>{r.dataHandling.remoteProcessors.join(', ')}</dd></>:null}</dl>
      <h4 className="ext-sub">{t('store.priv.network')}</h4>
      {r.network.length===0?<p className="ext-meta">{t('store.priv.none')}</p>:<ul className="store-links">{r.network.map(n=><li key={n.origin} className="store-net"><strong>{n.origin.replace(/^https:\/\//,'')}</strong><p className="ext-meta">{n.purpose}</p><p className="ext-meta">{t('store.priv.sends')}: {n.dataSent.join(', ')}</p><p className="ext-meta">{t('store.priv.receives')}: {n.dataReceived.join(', ')}</p>{n.accountRequired?<p className="ext-meta">{t('store.priv.account')}</p>:null}{n.paymentRequired?<p className="ext-meta">{t('store.priv.payment')}</p>:null}<button type="button" className="ext-link" onClick={()=>open(n.privacyUrl)}>{t('store.priv.policy')}</button></li>)}</ul>}
     </>:null}
    </div>
    {tab==='access'?<p className="store-info"><Info size={16} aria-hidden="true"/>{t('store.access.updates')}</p>:null}
   </div>
   <aside className="store-rail">
    <section className="store-rail-card" aria-label={t('store.ev.title',{version:r.version})}><h3 className="store-ph">{t('store.ev.title',{version:r.version})}</h3>
     <EvidenceList rows={rows} now={now} lastTrustedCheck={snapshot.lastTrustedCheck} hasEvidence={!!ev}/>
     <p className="ext-meta store-signed">{t('store.ev.signed',{digest:shortDigest(r.evidence.sha256)})} · <button type="button" className="ext-link" onClick={()=>setTab('evidence')}>{t('store.ev.full')}</button></p></section>
    <section className="store-rail-card" aria-label={t('store.pub.title')}><h3 className="store-ph">{t('store.pub.title')}</h3>
     <div className="ext-name-row"><strong>{card.publisherName}</strong>{card.verified?<StoreBadge onExplain={onExplain}/>:<span className="store-tag" title={t('store.unreviewed.body')}>{t('store.unreviewed')}</span>}</div>
     {ind?<div className="ext-tags">{ind.githubLinked?<span className="store-tag">{t('store.pub.github')}</span>:null}{ind.domainVerified?<span className="store-tag">{t('store.pub.domain')}</span>:null}{ind.declaresTwoFactor?<span className="store-tag">{t('store.pub.twofa')}</span>:null}</div>:null}
     <button type="button" className="ext-link" onClick={onExplain}>{t('store.pub.explain')}</button></section>
    <section className="store-rail-card store-report-card"><span className="store-report-q"><Flag size={16} aria-hidden="true"/>{t('store.report.card')}</span><button type="button" className="ext-btn" onClick={()=>setReport(true)}>{t('store.report.open')}</button></section>
   </aside>
  </div>
  <ReportConcern card={card} store={store} open={report} onClose={()=>setReport(false)} openExternal={u=>host.openExternal(u)}/>
 </div>;
}
