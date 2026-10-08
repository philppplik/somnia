import {useCallback,useEffect,useRef,useState} from 'react';
import {useT} from '../lib/useT';
import {deleteProviderKey,hasProviderKey,loadProviderKey,saveProviderKey,testProviderAuthentication,ProviderAuthError} from '../lib/agent/providerAuth';
const NAMES={claude:'Claude (Anthropic)',openrouter:'OpenRouter'} as const;
/** API-key connection for Claude / OpenRouter in Profile > Connections. Same keystore and test path as Agent settings; the key is never shown after saving. */
export function ProviderKeyConnection({provider}:{provider:'claude'|'openrouter'}){
 const {t}=useT();
 const [stored,setStored]=useState<boolean|null>(null),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState<{text:string;error:boolean}|null>(null);
 const epoch=useRef(0);
 const refresh=useCallback(async()=>{const id=++epoch.current;try{const v=await hasProviderKey(provider);if(id===epoch.current)setStored(v);}catch(e){if(id===epoch.current){setStored(null);setMsg({text:e instanceof ProviderAuthError?e.message:t('conn.error'),error:true});}}},[provider,t]);
 useEffect(()=>{void refresh();return()=>{epoch.current++;};},[refresh]);
 const run=async(op:'save'|'test'|'remove')=>{
  if(busy)return;setBusy(true);setMsg(null);
  try{
   if(op==='remove'){await deleteProviderKey(provider);setKey('');setMsg({text:t('conn.keyRemoved'),error:false});}
   else{const candidate=op==='save'?key.trim():await loadProviderKey(provider);await testProviderAuthentication(provider,candidate);if(op==='save'){await saveProviderKey(provider,candidate);setKey('');}setMsg({text:t(op==='save'?'conn.keySaved':'conn.keyVerified'),error:false});}
  }catch(e){setMsg({text:e instanceof ProviderAuthError?e.message:t('conn.error'),error:true});}
  finally{setBusy(false);await refresh();}
 };
 const name=NAMES[provider];
 return <div className="connection-box" aria-label={name}>
  <div className="connection-heading"><strong>{name}</strong><span role="status" className="github-badge" data-state={stored?'connected':'disconnected'}>{stored===null?t('github.state.checking'):t(stored?'conn.keyStored':'conn.noKey')}</span></div>
  <label>{t('conn.apiKey')}<input type="password" autoComplete="off" spellCheck={false} maxLength={8192} value={key} disabled={busy} placeholder={stored?t('conn.replacement'):t('conn.enterKey')} onChange={e=>{setKey(e.target.value);setMsg(null);}}/></label>
  <p>{t('conn.keyNote')}</p>
  <div className="github-actions">
   <button type="button" disabled={busy||!key.trim()} onClick={()=>void run('save')}>{t(stored?'conn.testReplace':'conn.testSave')}</button>
   {stored&&<button type="button" disabled={busy} onClick={()=>void run('test')}>{t('conn.testSaved')}</button>}
   {stored&&<button type="button" disabled={busy} onClick={()=>void run('remove')}>{t('conn.removeKey')}</button>}
  </div>
  {msg&&<p role={msg.error?'alert':'status'} className={msg.error?'account-error':undefined}>{msg.text}</p>}
 </div>;
}
/** Ollama has no account: this only checks that the local server answers. Nothing is sent but the model-list request. */
export function OllamaConnection(){
 const {t}=useT();
 const [state,setState]=useState<'unchecked'|'checking'|'ok'|'down'>('unchecked');
 const check=async()=>{setState('checking');try{await testProviderAuthentication('ollama','');setState('ok');}catch{setState('down');}};
 return <div className="connection-box" aria-label="Ollama">
  <div className="connection-heading"><strong>Ollama ({t('conn.local')})</strong><span role="status" className="github-badge" data-state={state==='ok'?'connected':'disconnected'}>{t('conn.ollama.'+state)}</span></div>
  <p>{t('conn.ollamaNote')}</p>
  <div className="github-actions"><button type="button" disabled={state==='checking'} onClick={()=>void check()}>{t('conn.check')}</button></div>
 </div>;
}
