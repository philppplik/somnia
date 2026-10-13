import {useEffect, useState} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {t} from '../lib/i18n';
import {installRuntime, removeRuntime, runtimeStatus, type RuntimeStatus} from '../lib/frameworks/runner';
export function FrameworkSettings() {
  const [status, setStatus] = useState<RuntimeStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  useEffect(()=>{let alive=true; void runtimeStatus().then(s=>{if(alive)setStatus(s);}).catch(()=>{if(alive)setError('frameworks.statusFailed');});return()=>{alive=false;};},[]);
  const act = async (action:()=>Promise<RuntimeStatus>) => {
    setBusy(true); setError('');
    try {setStatus(await action());setConsent(false);} catch(e) { const key=String(e);setError(key.startsWith('frameworks.')?key:'frameworks.operationFailed'); } finally {setBusy(false);}
  };
  return <div className="framework-settings" style={{display:'grid',gap:16,maxWidth:620}}>
    <p>{t('frameworks.description')}</p>
    <div style={{border:'1px solid var(--border)',borderRadius:25,padding:24,display:'grid',gap:12}}>
      <strong>{t('frameworks.helper')}</strong>
      <p role="status">{t(!isTauri()?'frameworks.desktopOnly':!status?'frameworks.checking':status.installed?'frameworks.ready':'frameworks.notInstalled')}</p>
      {status?.installed && <small>{t('frameworks.version')} {status.version}</small>}
      {!status?.installed && isTauri() && <>
        <p>{t('frameworks.downloadConsent')}</p>
        <label><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>{t('frameworks.consentLabel')}</label>
        <button type="button" disabled={busy || !consent || !status?.supported} onClick={()=>void act(installRuntime)}>{t(busy?'frameworks.downloading':'frameworks.download')}</button>
      </>}
      {status?.installed && <button type="button" disabled={busy} onClick={()=>void act(removeRuntime)}>{t(busy?'frameworks.removing':'frameworks.remove')}</button>}
      <small>{t('frameworks.safetyNote')}</small>
    </div>
    {error && <p role="alert">{t(error)}</p>}
  </div>;
}
