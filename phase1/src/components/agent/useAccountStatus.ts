import {useCallback,useEffect,useRef,useState} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {accountAuth,ACCOUNT_CHANGED,type AccountStatus,AccountAuthError} from '../../lib/agent/accountAuth';
import type {AuthProvider} from '../../lib/agent/providerAuth';
export function useAccountStatus(provider:AuthProvider){
 const [status,setStatus]=useState<AccountStatus|null>(null),[error,setError]=useState<AccountAuthError|null>(null);
 const generation=useRef(0),serial=useRef(0);
 const refresh=useCallback(async()=>{
  if(provider!=='openai'||!isTauri())return;
  const epoch=generation.current,id=++serial.current;
  try{const next=await accountAuth.status(provider);if(epoch===generation.current&&id===serial.current){setStatus(next);setError(null);}}
  catch(e){if(epoch===generation.current&&id===serial.current){setStatus(null);setError(e instanceof AccountAuthError?e:new AccountAuthError('unavailable'));}}
 },[provider]);
 useEffect(()=>{
  generation.current++;serial.current++;setStatus(null);setError(null);void refresh();
  const update=()=>void refresh();window.addEventListener(ACCOUNT_CHANGED,update);window.addEventListener('focus',update);
  return()=>{generation.current++;serial.current++;window.removeEventListener(ACCOUNT_CHANGED,update);window.removeEventListener('focus',update);};
 },[refresh]);
 useEffect(()=>{
  if(!status||!['pending','connected'].includes(status.state))return;
  const timer=setTimeout(()=>void refresh(),status.state==='pending'?2000:30000);
  return()=>clearTimeout(timer);
 },[status,refresh]);
 return {status,error,refresh,desktop:isTauri()};
}
