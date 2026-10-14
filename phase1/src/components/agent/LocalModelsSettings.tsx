import {LocalModelActions} from './LocalModelActions';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useT} from '../../lib/useT';
import {LocalModelsRuntime,type ModelEvidence,type RuntimeSnapshot} from '../../lib/agent/localModels';
import {Button} from '../ui/button';
import {Badge} from '../ui/badge';
import './localModels.css';

export function LocalModelsSettings({active,runtime:provided}:{active:boolean;runtime?:LocalModelsRuntime}){
 const {t,locale}=useT();const runtime=useMemo(()=>provided??new LocalModelsRuntime(),[provided]);
 const [snapshot,setSnapshot]=useState<RuntimeSnapshot|null>(null),[busy,setBusy]=useState(false);
 const [evidence,setEvidence]=useState<Record<string,ModelEvidence|'error'>>({});
 const generation=useRef(0);
 const refresh=async()=>{
  const request=++generation.current;setBusy(true);setEvidence({});
  try{
   const next=await runtime.snapshot();if(request!==generation.current)return;setSnapshot(next);
   // Only the first visible page is inspected. Two workers bound /api/show concurrency.
   let cursor=0;const page=next.models.slice(0,20);
   await Promise.all([0,1].map(async()=>{while(cursor<page.length&&request===generation.current){
    const model=page[cursor++];let value:ModelEvidence|'error';
    try{value=await runtime.evidence(model.id);}catch{value='error';}
    if(request===generation.current)setEvidence(old=>({...old,[model.id]:value}));
   }}));
  }finally{if(request===generation.current)setBusy(false);}
 };
 useEffect(()=>{if(active)void refresh();return()=>{generation.current++;setBusy(false);};},[active,runtime]);
 const [page,setPage]=useState(0);
 useEffect(()=>setPage(0),[snapshot]);
 const inspect=async(id:string)=>{const request=generation.current;try{const value=await runtime.evidence(id);if(request===generation.current)setEvidence(old=>({...old,[id]:value}));}catch{if(request===generation.current)setEvidence(old=>({...old,[id]:'error'}));}};
 const size=(bytes:number|undefined)=>bytes===undefined?t('local.unknown'):new Intl.NumberFormat(locale,{style:'unit',unit:'gigabyte',maximumFractionDigits:2}).format(bytes/1e9);
 return <section className="local-models" aria-label={t('local.title')}>
  <div className="local-models-header"><h3>{t('local.title')}</h3><Button type="button" variant="outline" disabled={busy} onClick={()=>void refresh()}>{t(busy?'local.checking':'local.refresh')}</Button></div>
  <p>{t('local.boundary')}</p>
  <div role="status" className="local-models-runtime"><strong>Ollama</strong> · {runtime.baseUrl}<br/>{t(snapshot?'local.state.'+snapshot.state:'local.notChecked')}{snapshot?.version&&` · ${snapshot.version}`}<br/>{snapshot&&t('local.checked',{time:new Date(snapshot.checkedAt).toLocaleTimeString(locale)})}{busy&&<p>{t('local.checking')}</p>}</div>
  {snapshot?.state==='not-found'&&<a href="https://ollama.com/download" target="_blank" rel="noreferrer">{t('local.install')}</a>}
  {!provided&&<LocalModelActions snapshot={snapshot} onChanged={refresh}/>}
  {snapshot?.state==='running'&&<>
   <h4>{t('local.installed')}</h4>
   {snapshot.inventoryError?<p role="alert">{t('local.inventoryError')}</p>:!snapshot.models.length?<p>{t('local.empty')}</p>:<>
    <ul className="local-models-list">{snapshot.models.slice(page*20,page*20+20).map(model=>{
     const info=evidence[model.id];return <li key={model.id}><strong>{model.id}</strong><div>{size(model.sizeBytes)} · {model.parameterSize??t('local.unknown')} · {model.quantization??t('local.unknown')}</div>
      <div className="local-models-badges"><Badge>{t('local.present')}</Badge><Badge>{t('local.locality.'+(!info||info==='error'?'unverified':info.locality))}</Badge>{info&&info!=='error'&&info.capabilities?.map(cap=><Badge key={cap}>{t('local.cap.'+cap)}</Badge>)}</div>
      <p>{t(info==='error'?'local.metadataError':!info||info.capabilities===null?'local.capUnknown':'local.advertised')}</p>
      {(!info||info==='error')&&!busy&&<Button type="button" size="compact" onClick={()=>void inspect(model.id)} aria-label={t('local.inspectModel',{model:model.id})}>{t('local.inspect')}</Button>}
     </li>;
    })}</ul>
    {snapshot.models.length>20&&<div className="local-models-header"><Button type="button" disabled={page===0} onClick={()=>setPage(p=>p-1)}>{t('local.previous')}</Button><span>{page+1} / {Math.ceil(snapshot.models.length/20)}</span><Button type="button" disabled={(page+1)*20>=snapshot.models.length} onClick={()=>setPage(p=>p+1)}>{t('local.next')}</Button></div>}
   </>}
  </>}
 </section>;
}
