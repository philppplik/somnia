import {useEffect,useRef,useState} from 'react';
import {useT} from '../../lib/useT';
import {accountAuth,notifyAccountChanged,type AccountMethod} from '../../lib/agent/accountAuth';
import type {AuthProvider} from '../../lib/agent/providerAuth';
import {useAccountStatus} from './useAccountStatus';
import {NativeButton,NativeSelect} from '../ui/native-controls';
export function ProviderAccountConnection({provider,disabled=false,manage=true,showMethod=true,onBusyChange,onCredentialChange}:{provider:AuthProvider;disabled?:boolean;/** false: connect/disconnect live in Profile > Connections; this surface only shows status and the method choice. */manage?:boolean;showMethod?:boolean;onBusyChange?:(busy:boolean)=>void;onCredentialChange?:()=>void}){
 const {t}=useT();const {status,error,refresh,desktop}=useAccountStatus(provider);
 const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const generation=useRef(0),callbacks=useRef({onBusyChange,onCredentialChange});callbacks.current={onBusyChange,onCredentialChange};
 useEffect(()=>{generation.current++;setBusy(false);setFailed(false);callbacks.current.onBusyChange?.(false);return()=>{generation.current++;callbacks.current.onBusyChange?.(false);};},[provider]);
 const act=async(operation:'start'|'cancel'|'disconnect'|'method',method?:AccountMethod)=>{
  if(busy||disabled)return;const id=generation.current;setBusy(true);setFailed(false);callbacks.current.onBusyChange?.(true);
  try{
   if(operation==='method')await accountAuth.setMethod(provider,method!);else await accountAuth[operation](provider);
   notifyAccountChanged();if(id!==generation.current)return;
   callbacks.current.onCredentialChange?.();await refresh();
  }catch{if(id===generation.current)setFailed(true);}
  finally{if(id===generation.current){setBusy(false);callbacks.current.onBusyChange?.(false);}}
 };
 const supported=provider==='openai';const available=supported&&desktop;
 return <div className="provider-account" aria-label={t('accountAuth.title')}>
  <div className="provider-account-heading"><strong>{t('accountAuth.title')}</strong><span role="status" aria-live="polite" className="provider-account-badge" data-state={status?.state}>{available?t(`accountAuth.state.${error?'unavailable':status?.state??'checking'}`):t(supported?'accountAuth.desktop':'accountAuth.unsupported')}</span></div>
  <p>{t(supported?'accountAuth.explanation':'accountAuth.apiOnly')}</p>
  {!manage&&available&&<p>{t('accountAuth.manageInProfile')}</p>}
  {manage&&<div className="provider-account-actions">
   <NativeButton type="button" disabled={!available||disabled||busy||!status||status.state==='pending'||status.state==='connected'} onClick={()=>void act('start')}>{t(status?.state==='expired'?'accountAuth.reconnect':'accountAuth.connect')}</NativeButton>
   {status?.state==='pending'&&<NativeButton type="button" disabled={busy||disabled} onClick={()=>void act('cancel')}>{t('accountAuth.cancel')}</NativeButton>}
   {status&&['connected','expired'].includes(status.state)&&<NativeButton type="button" disabled={busy||disabled} onClick={()=>void act('disconnect')}>{t('accountAuth.disconnect')}</NativeButton>}
   {available&&error&&<NativeButton type="button" disabled={busy||disabled} onClick={()=>void refresh()}>{t('accountAuth.retry')}</NativeButton>}
  </div>}
  {showMethod&&available&&status&&<label>{t('accountAuth.method')}<NativeSelect value={status.method} disabled={disabled||busy||status.state==='pending'} onChange={e=>void act('method',e.target.value as AccountMethod)}><option value="account" disabled={status.state!=='connected'}>{t('accountAuth.account')}</option><option value="api-key">{t('accountAuth.apiKey')}</option></NativeSelect></label>}
  {status?.state==='pending'&&<p>{t('accountAuth.pending')}</p>}
  {status&&['connected','expired'].includes(status.state)&&<p>{t('accountAuth.fallback')}</p>}
  {(failed||error)&&<p role="alert">{t('accountAuth.error')}</p>}
  {busy&&<p role="status">{t('accountAuth.working')}</p>}
 </div>;
}
