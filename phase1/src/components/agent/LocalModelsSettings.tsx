import {Field} from '../ui/field';import {NativeInput,NativeSelect} from '../ui/native-controls';import {Notice} from '../ui/notice';import {recordReadiness,clearReadiness} from '../../lib/agent/localReadinessCache';
import {agentSettingsSnapshot,subscribeAgentSettings} from '../../lib/agent/settingsRuntime';
import {LocalModelHealth} from './LocalModelHealth';
import {LocalModelDiskUsage} from './LocalModelDiskUsage';
import {lastLocalModelSuccess} from '../../lib/agent/localModelUsage';
import {LocalFirstRunGuide} from './LocalFirstRunGuide';
import {LocalAIHealth} from './LocalAIHealth';
import type {Hardware} from '../../lib/agent/localModelAdvice';
import {LocalModelAdvice} from './LocalModelAdvice';
import {LocalModelActions} from './LocalModelActions';
import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {useT} from '../../lib/useT';
import {LocalModelsRuntime,type ModelEvidence,type RuntimeSnapshot} from '../../lib/agent/localModels';
import {Button} from '../ui/button';
import {Badge} from '../ui/badge';
import './localModels.css';

export function LocalModelsSettings({active,runtime:provided,hardwareProbe}:{active:boolean;runtime?:LocalModelsRuntime;hardwareProbe?:()=>Promise<Hardware|null>}){
 const settings=useSyncExternalStore(subscribeAgentSettings,agentSettingsSnapshot,agentSettingsSnapshot);const configured=[...(settings.config.provider==='ollama'&&settings.config.model?[settings.config.model]:[]),...Object.values(settings.config.localRuntime?.taskModels??{}),...Object.values(settings.config.localRuntime?.studioModels??{})];
 const {t,locale}=useT();const runtime=useMemo(()=>provided??new LocalModelsRuntime(),[provided]);
 const [snapshot,setSnapshot]=useState<RuntimeSnapshot|null>(null),[busy,setBusy]=useState(false),[refreshError,setRefreshError]=useState(false);
 const [evidence,setEvidence]=useState<Record<string,ModelEvidence|'error'>>({});
 const pendingInspect=useRef(new Set<string>());const [inspecting,setInspecting]=useState<ReadonlySet<string>>(new Set());const generation=useRef(0);
 const refresh=async(explicit=false)=>{
  const request=++generation.current;pendingInspect.current=new Set();setInspecting(new Set());setBusy(true);setEvidence({});setRefreshError(false);
  try{
   const next=await runtime.snapshot();if(request!==generation.current)return;setSnapshot(next);if(explicit)recordReadiness(next,runtime.baseUrl);
   // Only the first visible page is inspected. Two workers bound /api/show concurrency.
   let cursor=0;const page=next.models.slice(0,20);
   await Promise.all([0,1].map(async()=>{while(cursor<page.length&&request===generation.current){
    const model=page[cursor++];let value:ModelEvidence|'error';
    try{value=await runtime.evidence(model.id);}catch{value='error';}
    if(request===generation.current)setEvidence(old=>({...old,[model.id]:value}));
   }}));
  }catch{if(request===generation.current){setSnapshot(null);setRefreshError(true);if(explicit)clearReadiness();}}finally{if(request===generation.current)setBusy(false);}
 };
 useEffect(()=>{if(active)void refresh();return()=>{generation.current++;setBusy(false);};},[active,runtime]);
 const [sort,setSort]=useState('name');const [filter,setFilter]=useState(''),[page,setPage]=useState(0);const matches=(snapshot?.models??[]).filter(model=>model.id.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())).sort((a,b)=>sort==='size'?(b.sizeBytes??-1)-(a.sizeBytes??-1)||a.id.localeCompare(b.id):a.id.localeCompare(b.id));
 useEffect(()=>setPage(0),[snapshot]);
 const inspect=async(id:string)=>{if(pendingInspect.current.has(id))return;const request=generation.current,owned=pendingInspect.current;owned.add(id);setInspecting(new Set(owned));try{const value=await runtime.evidence(id);if(request===generation.current)setEvidence(old=>({...old,[id]:value}));}catch{if(request===generation.current)setEvidence(old=>({...old,[id]:'error'}));}finally{owned.delete(id);if(request===generation.current)setInspecting(new Set(owned));}};
 const size=(bytes:number|undefined)=>bytes===undefined?t('local.unknown'):new Intl.NumberFormat(locale,{style:'unit',unit:'gigabyte',maximumFractionDigits:2}).format(bytes/1e9);
 return <section className="local-models" aria-label={t('local.title')}>
  <div className="local-models-header"><h3>{t('local.title')}</h3><Button type="button" variant="outline" disabled={busy} onClick={()=>void refresh(true)}>{t(busy?'local.checking':'local.refresh')}</Button></div>
  <p>{t('local.boundary')}</p>
  <LocalAIHealth snapshot={snapshot} busy={busy} refreshError={refreshError} onRefresh={()=>void refresh(true)}/>
  <LocalModelHealth configured={configured} snapshot={snapshot} runtime={runtime}/><LocalFirstRunGuide endpoint={runtime.baseUrl} snapshot={snapshot} busy={busy} onRefresh={()=>void refresh(true)}/>
  <LocalModelAdvice hardwareProbe={hardwareProbe} active={active} runtime={runtime} snapshot={snapshot}/>
  {!provided&&<LocalModelActions snapshot={snapshot} onChanged={refresh}/>}
  {snapshot?.state==='running'&&<>
   {!snapshot.inventoryError&&<LocalModelDiskUsage models={snapshot.models}/>}
   <h4>{t('local.installed')}</h4><Field label={t('local.filter.label')}>{control=><NativeInput {...control} maxLength={100} value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}/>}</Field><Field label={t('local.sort.label')}>{control=><NativeSelect {...control} value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}}><option value="name">{t('local.sort.name')}</option><option value="size">{t('local.sort.size')}</option></NativeSelect>}</Field><p>{t('local.sort.notice')}</p><p>{t('local.filter.count',{count:String(matches.length),total:String(snapshot.models.length)})}</p>{filter&&<Button type="button" variant="outline" onClick={()=>{setFilter('');setPage(0);}}>{t('local.filter.clear')}</Button>}<p>{t('local.manager.lastUsedNotice')}</p>
   {snapshot.inventoryError?<p>{t('local.inventoryError')}</p>:!snapshot.models.length?<p>{t('local.empty')}</p>:<>
    {!matches.length&&<Notice>{t('local.filter.empty')}</Notice>}<ul className="local-models-list">{matches.slice(page*20,page*20+20).map(model=>{
     const info=evidence[model.id],lastUsed=lastLocalModelSuccess(runtime.baseUrl,model.id);return <li key={model.id}><strong>{model.id}</strong><div>{size(model.sizeBytes)} · {model.parameterSize??t('local.unknown')} · {model.quantization??t('local.unknown')}</div>
      <p>{t('local.manager.lastUsed')}: {lastUsed===null?t('local.unknown'):new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(lastUsed)}</p><div className="local-models-badges"><Badge>{t('local.present')}</Badge><Badge>{t('local.locality.'+(!info||info==='error'?'unverified':info.locality))}</Badge>{info&&info!=='error'&&info.capabilities?.map(cap=><Badge key={cap}>{t('local.cap.'+cap)}</Badge>)}</div>
      <p>{t(info==='error'?'local.metadataError':!info||info.capabilities===null?'local.capUnknown':'local.advertised')}</p>
      {(!info||info==='error')&&!busy&&<Button type="button" size="compact" disabled={inspecting.has(model.id)} onClick={()=>void inspect(model.id)} aria-label={t('local.inspectModel',{model:model.id})}>{t(inspecting.has(model.id)?'local.inspectPending':'local.inspect')}</Button>}
     </li>;
    })}</ul>
    {matches.length>20&&<div className="local-models-header"><Button type="button" disabled={page===0} onClick={()=>setPage(p=>p-1)}>{t('local.previous')}</Button><span>{page+1} / {Math.ceil(matches.length/20)}</span><Button type="button" disabled={(page+1)*20>=matches.length} onClick={()=>setPage(p=>p+1)}>{t('local.next')}</Button></div>}
   </>}
  </>}
 </section>;
}
