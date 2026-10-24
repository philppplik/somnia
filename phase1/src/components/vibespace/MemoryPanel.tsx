import {useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {MemoryController,canDownload,canEnable,downloadPercent,formatBytes,vectorPhase,provenanceLabel} from '../../lib/vibespace/memory';
import type {MemoryKind,MemoryTransport} from '../../lib/vibespace/memory';
import {ms} from '../../lib/vibespace/i18nMemorySkills';
import './memory-skills.css';
import {NativeButton,NativeInput,NativeSelect,Textarea} from '../ui/native-controls';
/** Memory of ONE Vibe Space. Vector search is opt-in and every download or storage step is a visible choice. */
export function MemoryPanel({transport,spaceId,locale='en'}:{transport:MemoryTransport;spaceId:string;locale?:string}){
 const c=useMemo(()=>new MemoryController(transport,spaceId),[transport,spaceId]);
 const s=useSyncExternalStore(c.subscribe,c.getSnapshot,c.getSnapshot);
 const [kind,setKind]=useState<MemoryKind>('note'),[title,setTitle]=useState(''),[content,setContent]=useState(''),[q,setQ]=useState(''),[ack,setAck]=useState(false),[confirmDl,setConfirmDl]=useState(false),[confirmClear,setConfirmClear]=useState(false);
 useEffect(()=>{void c.refresh();},[c]);
 // While a download runs, poll status (native reports progress through this read).
 useEffect(()=>{if(s.model?.status!=='downloading')return;const id=setInterval(()=>{void c.refresh();},1000);return()=>clearInterval(id);},[c,s.model?.status]);
 const t=(k:Parameters<typeof ms>[1],p?:Record<string,string|number>)=>ms(locale,k,p);
 const phase=s.vector&&s.model?vectorPhase(s.vector,s.model):null;
 const size=s.model?formatBytes(s.model.totalBytes):'';
 const modeLabel=s.search?(s.search.mode==='hybrid'?t('vsm.search.mode.hybrid'):s.search.mode==='fts5'?t('vsm.search.mode.fts'):t('vsm.search.mode.plain')):'';
 return <section className="vsx" aria-label={t('vsm.title')}>
  <div><h2>{t('vsm.title')}</h2><p className="vsx-muted">{t('vsm.intro')}</p></div>
  {s.error&&<div className="vsx-card vsx-error" role="alert"><strong>{t('vsm.error')}</strong><p className="vsx-muted" data-copyable>{s.error}</p></div>}
  <form className="vsx-card" onSubmit={e=>{e.preventDefault();void c.add(kind,title,content).then(()=>{setTitle('');setContent('');});}}>
   <h3>{t('vsm.add')}</h3>
   <div className="vsx-row">
    <label>{t('vsm.add.kind')} <NativeSelect aria-label={t('vsm.add.kind')} value={kind} onChange={e=>setKind(e.target.value as MemoryKind)}>{(['fact','preference','note'] as const).map(k=><option key={k} value={k}>{t(`vsm.kind.${k}` as 'vsm.kind.fact')}</option>)}</NativeSelect></label>
    <NativeInput aria-label={t('vsm.add.title')} placeholder={t('vsm.add.title')} value={title} maxLength={200} onChange={e=>setTitle(e.target.value)}/>
   </div>
   <Textarea aria-label={t('vsm.add.content')} placeholder={t('vsm.add.content')} value={content} onChange={e=>setContent(e.target.value)}/>
   <div className="vsx-row"><NativeButton type="submit" disabled={s.busy||!content.trim()}>{t('vsm.add')}</NativeButton></div>
  </form>
  <form className="vsx-card" role="search" onSubmit={e=>{e.preventDefault();void c.search(q);}}>
   <div className="vsx-row"><NativeInput aria-label={t('vsm.search')} placeholder={t('vsm.search')} value={q} onChange={e=>setQ(e.target.value)}/><NativeButton type="submit" disabled={s.busy}>{t('vsm.search.go')}</NativeButton></div>
   {s.search&&<><p className="vsx-muted" role="status">{t('vsm.search.mode',{mode:modeLabel})}</p>
    {s.search.hits.length===0?<p className="vsx-muted">{t('vsm.search.none')}</p>:<ul aria-label="search results">{s.search.hits.map(h=><li key={h.item.id}>{h.item.title?<b>{h.item.title}: </b>:null}{h.item.content}</li>)}</ul>}</>}
  </form>
  <div className="vsx-card" aria-label={t('vsm.vector.title')}>
   <h3>{t('vsm.vector.title')}</h3>
   {phase==='unavailable'&&<p className="vsx-muted">{t('vsm.vector.unavailable')}</p>}
   {phase&&phase!=='unavailable'&&phase!=='on'&&phase!=='indexing'&&<p className="vsx-muted">{t('vsm.vector.off')}</p>}
   {s.vector&&s.model&&phase!=='unavailable'&&<>
    {(phase==='needs-model')&&<><p className="vsx-muted">{t('vsm.vector.explain',{size})}</p>
     {!confirmDl?<div className="vsx-row"><NativeButton type="button" disabled={s.busy||!canDownload(s.vector,s.model)} onClick={()=>setConfirmDl(true)}>{t('vsm.vector.download',{size})}</NativeButton></div>
      :<div className="vsx-row"><NativeButton type="button" disabled={s.busy} onClick={()=>{setConfirmDl(false);void c.downloadModel();}}>{t('vsm.vector.downloadConfirm',{size})}</NativeButton><NativeButton type="button" onClick={()=>setConfirmDl(false)}>{t('vsm.vector.cancel')}</NativeButton></div>}</>}
    {phase==='downloading'&&<><div className="vsx-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={downloadPercent(s.model)}><span style={{width:`${downloadPercent(s.model)}%`}}/></div>
     <p className="vsx-muted" role="status">{t('vsm.vector.downloading',{percent:downloadPercent(s.model),done:formatBytes(s.model.downloadedBytes),size})}</p>
     <div className="vsx-row"><NativeButton type="button" onClick={()=>void c.cancelDownload()}>{t('vsm.vector.cancel')}</NativeButton></div></>}
    {phase==='ready-to-enable'&&<><p className="vsx-muted">{t('vsm.vector.ready')}</p>
     <label className="vsx-row"><NativeInput type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/><span>{t('vsm.vector.ack')}</span></label>
     <div className="vsx-row"><NativeButton type="button" disabled={s.busy||!canEnable(s.vector,s.model,ack)} onClick={()=>{void c.enableVector(ack);setAck(false);}}>{t('vsm.vector.enable')}</NativeButton></div></>}
    {(phase==='indexing'||phase==='on')&&<><p className="vsx-muted" role="status">{phase==='indexing'?t('vsm.vector.indexing',{indexed:s.vector.indexed,total:s.vector.total}):t('vsm.vector.on',{indexed:s.vector.indexed,total:s.vector.total})}</p>
     <div className="vsx-row"><NativeButton type="button" disabled={s.busy} onClick={()=>void c.disableVector()}>{t('vsm.vector.disable')}</NativeButton></div></>}
   </>}
  </div>
  <div className="vsx-card">
   {s.items.length===0?<p className="vsx-muted">{t('vsm.empty')}</p>:<ul style={{listStyle:'none',padding:0,margin:0,display:'flex',flexDirection:'column',gap:8}}>
    {s.items.map(i=>{const p=provenanceLabel(i);return <li key={i.id} className="vsx-card" data-memory-id={i.id}>
     <div className="vsx-row"><span className="vsx-badge" data-tone={p.needsReview?'warn':'ok'}>{t(`vsm.kind.${i.kind}` as 'vsm.kind.fact')}</span>{i.title&&<b>{i.title}</b>}</div>
     <p style={{margin:0}} data-copyable>{i.content}</p>
     <p className="vsx-muted">{t('vsm.source')}: {p.source} · {p.needsReview?t('vsm.review.waiting'):p.consent}</p>
     <div className="vsx-row">{p.needsReview&&<><NativeButton type="button" disabled={s.busy} onClick={()=>void c.review(i.id,true)}>{t('vsm.review.approve')}</NativeButton><NativeButton type="button" disabled={s.busy} onClick={()=>void c.review(i.id,false)}>{t('vsm.review.reject')}</NativeButton></>}
      <NativeButton type="button" disabled={s.busy} onClick={()=>void c.remove(i.id)}>{t('vsm.delete')}</NativeButton></div></li>;})}</ul>}
   {s.items.length>0&&(!confirmClear?<div className="vsx-row"><NativeButton type="button" onClick={()=>setConfirmClear(true)}>{t('vsm.clearAll')}</NativeButton></div>
    :<div className="vsx-row"><span>{t('vsm.clearAll.confirm',{count:s.items.length})}</span><NativeButton type="button" onClick={()=>{setConfirmClear(false);void c.clearAll();}}>{t('vsm.delete')}</NativeButton><NativeButton type="button" onClick={()=>setConfirmClear(false)}>{t('vsm.vector.cancel')}</NativeButton></div>)}
  </div>
 </section>;
}
