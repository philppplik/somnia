import {localPullFailure,connectionState} from '../../lib/agent/localResilience';
import {useEffect,useState,useSyncExternalStore} from 'react';
import {useT} from '../../lib/useT';
import type {RuntimeSnapshot} from '../../lib/agent/localModels';
import {localModelManager,type LocalModelManager} from '../../lib/agent/localModelManager';
import {Button} from '../ui/button';
/** Shares the Local tab snapshot and owned transfer events. Never starts a second poller. */
export function LocalAIHealth({snapshot,busy,onRefresh,manager=localModelManager,refreshError=false}:{snapshot:RuntimeSnapshot|null;busy:boolean;onRefresh:()=>void;manager?:LocalModelManager;refreshError?:boolean}){
 const {t,locale}=useT();const job=useSyncExternalStore(manager.subscribe,manager.snapshot,manager.snapshot);
 const [online,setOnline]=useState(()=>typeof navigator==='undefined'?null:navigator.onLine),[hidden,setHidden]=useState('');
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 const errors=[...(refreshError?[t('local.health.refreshFailed')]:[]),...(snapshot?.inventoryError?[t('local.inventoryError')]:[]),...(snapshot&&snapshot.state!=='running'?[t('local.state.'+snapshot.state)]:[]),...(job?.error?[t('local.resilience.error.'+localPullFailure(job.error))]:[])];
 const fingerprint=JSON.stringify([snapshot?.checkedAt,job?.phase,job?.error,errors]);const visible=errors.length>0&&hidden!==fingerprint;
 return <section className="local-ai-health local-models-runtime" aria-label={t('local.health.title')}><div className="local-models-header"><h3>{t('local.health.title')}</h3><Button type="button" variant="outline" disabled={busy} onClick={()=>{setHidden('');onRefresh();}}>{t(busy?'local.checking':'local.resilience.test')}</Button></div><p>{t('local.health.boundary')}</p>
 <p role="status">{t('local.resilience.connection')}: {t('local.resilience.state.'+connectionState(snapshot,refreshError))}</p><p>{t('local.resilience.boundary')}</p><dl><dt>Ollama</dt><dd>{t(snapshot?'local.state.'+snapshot.state:'local.notChecked')}{snapshot?.version&&` · ${snapshot.version}`}</dd><dt>{t('local.installed')}</dt><dd>{snapshot?.state==='running'&&!snapshot.inventoryError?t('local.health.models',{count:snapshot.models.length}):t('local.health.modelsUnknown')}</dd></dl>
 {snapshot&&<p>{t('local.checked',{time:new Date(snapshot.checkedAt).toLocaleTimeString(locale)})}</p>}
 {online!==null&&<p>{t(online?'local.health.networkOnline':'local.health.networkOffline')}</p>}
 <div role="status">{!job?t('local.health.pullNone'):<><strong>{t('local.health.pull',{model:job.model})}</strong><p>{t('local.job.'+job.phase)}</p>{job.layer&&<p>{t('local.health.partial',{completed:job.layer.completed??'?',total:job.layer.total??'?'})}</p>}{job.cancelOutcome&&<p>{t('local.cancel.'+job.cancelOutcome)}</p>}</>}</div>
 {visible&&<div role="alert"><h4>{t('local.health.errorTitle')}</h4><ul>{errors.map((error,i)=><li key={i}>{error}</li>)}</ul><p>{t('local.health.errorHint')}</p><Button type="button" variant="outline" onClick={()=>setHidden(fingerprint)}>{t('local.health.dismiss')}</Button></div>}{errors.length>0&&!visible&&<p>{t('local.health.errorHidden')}</p>}</section>;
}
