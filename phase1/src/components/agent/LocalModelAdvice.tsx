import {ramFit,firstRamModel,ramTasks} from '../../lib/agent/localRamFit';
import {deviceModelSuggestion} from '../../lib/agent/localModelPicker';
import {useEffect,useRef,useState} from 'react';
import {useT} from '../../lib/useT';
import type {LocalModelsRuntime,RuntimeSnapshot} from '../../lib/agent/localModels';
import {inspectHardware,estimateFit,LOCAL_MODEL_CATALOG,parseResidency,type Hardware,type Residency} from '../../lib/agent/localModelAdvice';
import {Button} from '../ui/button';
import {Badge} from '../ui/badge';
export function LocalModelAdvice({active,runtime,snapshot,hardwareProbe=inspectHardware}:{active:boolean;runtime:LocalModelsRuntime;snapshot:RuntimeSnapshot|null;hardwareProbe?:()=>Promise<Hardware|null>}){
 const {t,locale}=useT();const [hardware,setHardware]=useState<Hardware|null>(null),[loaded,setLoaded]=useState<Residency[]|null>(null),[checking,setChecking]=useState(false);
 const generation=useRef(0);
 useEffect(()=>{if(!hardware)return;const timer=setTimeout(()=>setHardware(old=>old===hardware?{...old}:old),Math.max(0,hardware.checkedAt+120001-Date.now()));return()=>clearTimeout(timer);},[hardware?.checkedAt]);
 const refresh=async()=>{const id=++generation.current;setChecking(true);const [hw,ps]=await Promise.all([hardwareProbe(),runtime.running().then(parseResidency).catch(()=>null)]);if(generation.current!==id)return;setHardware(hw);setLoaded(ps);setChecking(false);};
 useEffect(()=>{if(active)void refresh();return()=>{generation.current++;setChecking(false);};},[active,runtime,snapshot?.checkedAt]);
 const bytes=(value:number|null|undefined)=>value==null?t('local.unknown'):new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(value/1024**3)+' GiB';
 return <section className="local-model-advice">
  <div className="local-models-header"><h4>{t('local.hardware.title')}</h4><Button type="button" variant="outline" size="compact" disabled={checking} onClick={()=>void refresh()}>{t('local.refresh')}</Button></div>
  {hardware?<div className="local-models-runtime"><p>{hardware.os} / {hardware.arch} · {hardware.cpu??t('local.unknown')} · {hardware.cores??'?'} {t('local.hardware.cores')}</p><p>RAM: {bytes(hardware.ramAvailableBytes)} / {bytes(hardware.ramTotalBytes)}</p>{hardware.gpus.map((gpu,i)=><p key={i}>{gpu.name}: {gpu.unified?t('local.hardware.shared'):bytes(gpu.freeBytes)+' / '+bytes(gpu.totalBytes)} {gpu.lowerBound&&t('local.hardware.lowerBound')}</p>)}{!hardware.gpus.length&&<p>{t('local.hardware.gpuUnknown')}</p>}<p>{t('local.hardware.storageUnknown')}</p></div>:<p>{t('local.hardware.unavailable')}</p>}
  <p>{t('local.hardware.heuristic')}</p><p>{t('local.ram.boundary')}</p><ul>{ramTasks.map(task=><li key={task}>{t('local.task.'+task)}: {firstRamModel(task,hardware)?t('local.ram.suggestion',{model:firstRamModel(task,hardware)!}):t('local.ram.noSuggestion')}</li>)}</ul><p role="status">{deviceModelSuggestion(hardware)?t('local.manager.recommended',{model:deviceModelSuggestion(hardware)!}):t('local.manager.noRecommendation')}</p>
  {snapshot?.models.map(model=>{const resident=loaded?.find(m=>m.model===model.id);return <p key={model.id}><strong>{model.id}</strong> · <Badge>{t('local.fit.'+estimateFit(model.sizeBytes,hardware).label)}</Badge> · {bytes(model.sizeBytes)} <Badge>{t('local.ram.'+ramFit(model.sizeBytes,hardware).state)}</Badge> · {loaded===null?t('local.hardware.residencyUnknown'):resident?t('local.hardware.loaded',{bytes:bytes(resident.sizeVramBytes)}):t('local.hardware.notLoaded')}</p>;})}
  <h4>{t('local.catalog.title')}</h4><p>{t('local.catalog.boundary')}</p>
  <ul className="local-models-list">{LOCAL_MODEL_CATALOG.map(entry=><li key={entry.id}><strong>{entry.tag}</strong> <Badge>{t('local.fit.'+estimateFit(entry.estimatedBytes,hardware).label)}</Badge> <Badge>{t('local.ram.'+ramFit(entry.estimatedBytes,hardware).state)}</Badge><p>{entry.license} · {bytes(entry.estimatedBytes)} {t('local.catalog.estimate')} · {entry.reviewedAt}</p><p>{entry.candidateTasks.map(task=>t('local.cap.'+task)).join(' / ')} · {t(entry.adapterSupport==='text-only-image-pending'?'local.catalog.imagePending':'local.catalog.variantCheck')}</p><a href={entry.sourceUrl} target="_blank" rel="noreferrer">{t('local.catalog.source')}</a></li>)}</ul>
 </section>;
}
