import {useEffect,useRef,useState} from 'react';
import {useT} from '../../lib/useT';
import {LocalModelsRuntime} from '../../lib/agent/localModels';
import {OllamaProvider} from '../../lib/agent/providers/ollama';
import {requireLocalCapabilities} from '../../lib/agent/localCapabilities';
import {runToolProbe,runVisionProbe,readProbe,storeProbe,probeKey,type ProbeReport,type ProbeIdentity} from '../../lib/agent/localQualityProbes';
import {mutationAllowed} from '../../lib/agent/localModelManager';
import {setAgentActivity} from '../../lib/agent/settingsRuntime';
import type {LocalRuntimePreferences} from '../../lib/agent/settings';
import {Button} from '../ui/button';
export function LocalQualityProbes({model,options}:{model:string;options:LocalRuntimePreferences|undefined}){
 const {t}=useT();const [reports,setReports]=useState<ProbeReport[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');const controller=useRef<AbortController|null>(null);
 useEffect(()=>{setReports([]);return()=>controller.current?.abort();},[model,options?.numCtx]);
 const identity=async():Promise<ProbeIdentity>=>{const runtime=new LocalModelsRuntime();const snapshot=await runtime.snapshot();const entry=snapshot.models.find(row=>row.id===model||row.id===model+':latest');if(snapshot.inventoryError||!entry?.digest||!snapshot.version)throw Error(t('local.probe.identity'));return {endpoint:runtime.baseUrl,model:entry.id,digest:entry.digest,daemonVersion:snapshot.version,numCtx:options?.numCtx};};
 const run=async(kind:'tools'|'vision',cachedOnly=false)=>{
  if(!mutationAllowed()||!model)return;const abort=new AbortController();controller.current=abort;setAgentActivity(true,false);setBusy(true);setError('');const timeout=setTimeout(()=>abort.abort(),180000);
  try{
   const id=await identity();abort.signal.throwIfAborted();
   const cached=readProbe(id,kind);if(cachedOnly){setReports(old=>[...old.filter(r=>r.kind!==kind),...(cached?[cached]:[])]);if(!cached)setError(t('local.probe.noCache'));return;}
   const provider=requireLocalCapabilities(new OllamaProvider({maxRetries:0,numCtx:options?.numCtx,keepAliveSeconds:options?.keepAliveSeconds}),options?.numCtx);
   const report=kind==='tools'?await runToolProbe(provider,id,abort.signal):await runVisionProbe(provider,id,abort.signal);
   const current=await identity();abort.signal.throwIfAborted();if(probeKey(current,kind)!==probeKey(id,kind))throw Error(t('local.probe.changed'));
   storeProbe(report);setReports(old=>[...old.filter(r=>r.kind!==kind),report]);
  }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:t('local.action.failed'));}
  finally{clearTimeout(timeout);controller.current=null;setAgentActivity(false,false);setBusy(false);}
 };
 return <details className="local-runtime-discovery"><summary>{t('local.probe.title')}</summary><p>{t('local.probe.boundary',{model})}</p><div className="local-models-badges"><Button type="button" disabled={busy||!model} onClick={()=>void run('tools')}>{t('local.probe.tools')}</Button><Button type="button" disabled={busy||!model||!options?.numCtx} onClick={()=>void run('vision')}>{t('local.probe.vision')}</Button><Button type="button" disabled={busy} onClick={()=>void run('tools',true)}>{t('local.probe.cachedTools')}</Button><Button type="button" disabled={busy} onClick={()=>void run('vision',true)}>{t('local.probe.cachedVision')}</Button>{busy&&<Button type="button" onClick={()=>controller.current?.abort()}>{t('local.action.cancel')}</Button>}</div>{error&&<p role="alert">{error}</p>}{reports.map(report=><p key={report.kind}>{report.kind}: {t(report.passed?'local.probe.pass':'local.probe.fail')} · {report.checks.filter(c=>c.passed).length}/{report.checks.length} · {report.durationMs} ms · {report.identity.digest.slice(0,16)} · {new Date(report.checkedAt).toLocaleTimeString()}</p>)}</details>;
}
