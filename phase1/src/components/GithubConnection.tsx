import {useCallback,useEffect,useState} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {useT} from '../lib/useT';
import {githubAuth,GITHUB_CHANGED,notifyGithubChanged,type GithubStatus} from '../lib/githubAccount';
/** GitHub account login for the account popup. Device flow: the code is shown here, approval happens on github.com. */
export function GithubConnection(){
 const {t}=useT();const desktop=isTauri();
 const [status,setStatus]=useState<GithubStatus|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const refresh=useCallback(async()=>{if(!desktop)return;try{setStatus(await githubAuth.status());setFailed(false);}catch{setStatus(null);setFailed(true);}},[desktop]);
 useEffect(()=>{void refresh();const u=()=>void refresh();window.addEventListener(GITHUB_CHANGED,u);window.addEventListener('focus',u);return()=>{window.removeEventListener(GITHUB_CHANGED,u);window.removeEventListener('focus',u);};},[refresh]);
 useEffect(()=>{if(status?.state!=='pending')return;const id=setTimeout(()=>void refresh(),2000);return()=>clearTimeout(id);},[status,refresh]);
 const act=async(op:'start'|'cancel'|'disconnect')=>{if(busy)return;setBusy(true);setFailed(false);try{setStatus(await githubAuth[op]());notifyGithubChanged();}catch{setFailed(true);}finally{setBusy(false);}};
 const state=status?.state;
 return <div className="github-connection" aria-label={t('github.title')}>
  <div className="github-connection-heading"><strong>{t('github.title')}</strong>
   <span role="status" aria-live="polite" className="github-badge" data-state={state}>{desktop?t(`github.state.${failed&&!status?'unavailable':state??'checking'}`):t('github.desktop')}</span></div>
  <p>{t('github.explanation')}</p>
  {state==='connected'&&<div className="github-identity"><span className="account-avatar" aria-hidden="true">{Array.from(status!.login??'?')[0].toLocaleUpperCase()}</span>
   <div><strong>{status!.name||status!.login}</strong>{status!.name&&<p>@{status!.login}</p>}</div></div>}
  {state==='pending'&&<div className="github-code" role="group" aria-label={t('github.codeLabel')}>
   <p>{status!.userCode?t('github.pending'):t('github.starting')}</p>
   {status!.userCode&&<code aria-live="polite">{status!.userCode}</code>}
   {status!.userCode&&<p>{t('github.openPage',{url:'github.com/login/device'})}</p>}</div>}
  <div className="github-actions">
   {state!=='connected'&&<button type="button" disabled={!desktop||busy||!state||state==='pending'} onClick={()=>void act('start')}>{t('github.connect')}</button>}
   {state==='connected'&&status!.scopeUpgrade&&<button type="button" disabled={!desktop||busy} onClick={()=>void act('start')}>{t('github.reconnect')}</button>}
   {state==='pending'&&<button type="button" disabled={busy} onClick={()=>void act('cancel')}>{t('github.cancel')}</button>}
   {state==='connected'&&<button type="button" disabled={busy} onClick={()=>void act('disconnect')}>{t('github.disconnect')}</button>}
   {desktop&&failed&&<button type="button" disabled={busy} onClick={()=>void refresh()}>{t('github.retry')}</button>}
  </div>
  {state==='connected'&&status!.scopeUpgrade&&<p role="status" className="github-note">{t('github.upgrade')}</p>}
  {state==='connected'&&<p className="github-note">{t('github.revoke')}</p>}
  {failed&&<p role="alert" className="account-error">{t('github.error')}</p>}
 </div>;
}
