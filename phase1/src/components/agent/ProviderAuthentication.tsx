import {ProviderAccountConnection} from './ProviderAccountConnection';
import {useEffect,useRef,useState} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {deleteProviderKey,hasProviderKey,loadProviderKey,saveProviderKey,testProviderAuthentication,ProviderAuthError,type AuthProvider} from '../../lib/agent/providerAuth';
/** Editing does not overwrite a working key. Only a successful test + keystore write rotates it. */
export function ProviderAuthentication({provider,disabled=false,onBusyChange,onCredentialChange}:{provider:AuthProvider;disabled?:boolean;onBusyChange?:(busy:boolean)=>void;onCredentialChange?:()=>void}){
 const [key,setKey]=useState(''),[stored,setStored]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false),[accountBusy,setAccountBusy]=useState(false);
 const controller=useRef<AbortController|null>(null),epoch=useRef(0);
 const callbacks=useRef({onBusyChange,onCredentialChange});callbacks.current={onBusyChange,onCredentialChange};
 useEffect(()=>{
  const id=++epoch.current;setKey('');setStored(false);setMessage('');setError(false);setBusy(false);callbacks.current.onBusyChange?.(false);
  if(provider!=='ollama')void hasProviderKey(provider).then(value=>{if(id===epoch.current){setStored(!!value);setMessage(value?'A saved key is available. Test it or enter a replacement.':'No key saved.');}}).catch(()=>{if(id===epoch.current){setError(true);setMessage(new ProviderAuthError('keystore-locked').message);}});
  return()=>{epoch.current++;controller.current?.abort();callbacks.current.onBusyChange?.(false);};
 },[provider]);
 const act=async(operation:'test'|'delete')=>{
  if(busy||accountBusy||disabled)return;const id=epoch.current,abort=new AbortController();controller.current=abort;setBusy(true);callbacks.current.onBusyChange?.(true);setError(false);setMessage('');
  try{
   if(operation==='delete'){
    await deleteProviderKey(provider);if(id!==epoch.current)return;
    setStored(false);setKey('');setMessage('Key deleted from Somnia. Revoke it at the provider to invalidate it everywhere.');callbacks.current.onCredentialChange?.();
   }else{
    const candidate=provider==='ollama'?'':key.trim()||await loadProviderKey(provider);
    await testProviderAuthentication(provider,candidate,{signal:abort.signal});
    if(id!==epoch.current||abort.signal.aborted)return;
    if(provider!=='ollama'&&key.trim())await saveProviderKey(provider,candidate);
    if(id!==epoch.current)return;
    if(provider!=='ollama'){setStored(true);setKey('');callbacks.current.onCredentialChange?.();}
    setMessage(provider==='ollama'?'Local Ollama is reachable. Inference will verify the selected model separately.':`Key verified${key.trim()?' and saved':''}. This does not guarantee model access or available credits.`);
   }
  }catch(e){if(id===epoch.current){setError(true);setMessage(e instanceof ProviderAuthError?e.message:new ProviderAuthError('keystore-locked').message);}}
  finally{if(id===epoch.current){setBusy(false);callbacks.current.onBusyChange?.(false);controller.current=null;}}
 };
 return <fieldset className="ag-provider-auth"><legend>Provider connection</legend>
  {provider!=='ollama'&&<><label>API key<input type="password" autoComplete="off" spellCheck={false} maxLength={8192} value={key} disabled={busy||accountBusy||disabled} placeholder={stored?'Enter a replacement key':'Enter your provider API key'} onChange={e=>{setKey(e.target.value);setMessage('');setError(false);}}/></label>
  <p>{isTauri()?'Keys are stored in your OS credential store.':'Browser preview keeps keys only for this session.'} Testing sends only the key to the selected provider. No prompt or project files are sent, and no generation is requested.</p></>}
  <ProviderAccountConnection provider={provider} disabled={busy||disabled} onBusyChange={value=>{setAccountBusy(value);callbacks.current.onBusyChange?.(value);}} onCredentialChange={onCredentialChange}/>
  <div className="ag-auth-actions"><button type="button" disabled={busy||accountBusy||disabled} onClick={()=>void act('test')}>{provider==='ollama'?'Test local connection':key.trim()?(stored?'Test and rotate key':'Test and save key'):'Test saved key'}</button>
  {provider!=='ollama'&&<button type="button" disabled={busy||accountBusy||disabled} onClick={()=>void act('delete')}>Delete key</button>}
  {busy&&<button type="button" onClick={()=>controller.current?.abort()}>Cancel test</button>}</div>
  {(message||busy)&&<p role={error?'alert':'status'} aria-live="polite">{busy?'Checking connection...':message}</p>}
 </fieldset>;
}
