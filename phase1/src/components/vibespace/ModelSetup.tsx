import {useCallback,useEffect,useState} from 'react';
import {useT} from '../../lib/useT';
import {probeLocal,TRIAL_PULL_COMMAND,type LocalProviderId,type Readiness} from '../../lib/vibespace/modelReadiness';
type Probe=(p:LocalProviderId)=>Promise<Readiness>;
type Entry={status:'checking'}|{status:'error'}|{status:'done';readiness:Readiness};
const PROVIDERS:LocalProviderId[]=['ollama','lmstudio'];
/** Read-only local model setup. It never starts a download; the user runs the shown command themselves. */
export function ModelSetup({probe=p=>probeLocal(p),initial}:{probe?:Probe;initial?:Partial<Record<LocalProviderId,Entry>>}){
 const {t}=useT();
 const [state,setState]=useState<Record<LocalProviderId,Entry>>({ollama:{status:'checking'},lmstudio:{status:'checking'},...initial});
 const check=useCallback((p:LocalProviderId)=>{
  setState(s=>({...s,[p]:{status:'checking'}}));
  probe(p).then(readiness=>setState(s=>({...s,[p]:{status:'done',readiness}})),()=>setState(s=>({...s,[p]:{status:'error'}})));
 },[probe]);
 useEffect(()=>{if(!initial)PROVIDERS.forEach(check);},[check,initial]);
 return <section className="vs-card" aria-label={t('vs.model.title')}>
  <header><p className="vs-eyebrow">{t('vs.model.trial')}</p><h3>{t('vs.model.title')}</h3><p className="vs-muted">{t('vs.model.intro')}</p></header>
  {PROVIDERS.map(p=>{const e=state[p];const r=e.status==='done'?e.readiness:null;
   const label=e.status==='checking'?t('vs.model.status.checking'):e.status==='error'?t('vs.model.status.error'):r!.state==='ready'?t('vs.model.status.ready',{model:r!.modelId}):r!.state==='model-missing'?t('vs.model.status.missing'):t('vs.model.status.down');
   return <div key={p} className="vs-model-row" data-provider={p} data-state={e.status==='done'?r!.state:e.status}>
    <strong>{t('vs.model.provider.'+p)}</strong><span role="status">{label}</span>
    {r&&r.state!=='ready'&&<p className="vs-muted">{t(r.hintKey)}</p>}
    {r&&r.state!=='ready'&&p==='ollama'&&<pre data-copyable>{TRIAL_PULL_COMMAND}</pre>}
    {r&&r.state!=='server-down'&&<p className="vs-muted">{t('vs.model.installed',{count:r.installed.length})}</p>}
    <button type="button" disabled={e.status==='checking'} onClick={()=>check(p)}>{t('vs.model.recheck')}</button>
   </div>;})}
  <p className="vs-muted">{t('vs.model.localOnly')}</p>
 </section>;
}
