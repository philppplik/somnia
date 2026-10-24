import {NativeSelect} from '../ui/native-controls';
import {Field} from '../ui/field';
import {useState} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {useT} from '../../lib/useT';
import {discoveryOrigin,parseDiscoveredModels,type DiscoveredModel,type DiscoveryRuntime} from '../../lib/agent/localRuntimeDiscovery';
import {Input} from '../ui/input';
import {Button} from '../ui/button';
export function AlternateRuntimeDiscovery(){
 const {t}=useT();const [runtime,setRuntime]=useState<DiscoveryRuntime>('llama.cpp'),[endpoint,setEndpoint]=useState('http://127.0.0.1:8080'),[rows,setRows]=useState<DiscoveredModel[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const inspect=async()=>{setBusy(true);setError('');setRows(null);try{if(!isTauri())throw Error(t('local.discovery.desktop'));const baseUrl=discoveryOrigin(endpoint);setRows(parseDiscoveredModels(runtime,await invoke('local_models_discover',{baseUrl,runtime})));}catch(e){setError(e instanceof Error?e.message:t('local.action.failed'));}finally{setBusy(false);}};
 return <details className="local-runtime-discovery"><summary>{t('local.discovery.title')}</summary><p>{t('local.discovery.boundary')}</p><Field label={t('local.discovery.runtime')}>{control=><NativeSelect {...control} disabled={busy} value={runtime} onChange={e=>{const value=e.target.value as DiscoveryRuntime;setRuntime(value);setEndpoint(value==='lmstudio'?'http://127.0.0.1:1234':'http://127.0.0.1:8080');setRows(null);}}><option value="llama.cpp">llama.cpp</option><option value="lmstudio">LM Studio</option></NativeSelect>}</Field><Field label={t('local.discovery.endpoint')}>{control=><Input {...control} disabled={busy} value={endpoint} onChange={e=>{setEndpoint(e.target.value);setRows(null);}}/>}</Field><Button type="button" disabled={busy} onClick={()=>void inspect()}>{t('local.discovery.inspect')}</Button>{error&&<p role="alert">{error}</p>}{rows&&<ul>{rows.map(model=><li key={model.id}>{model.id} · {t('local.locality.unverified')}</li>)}</ul>}{rows?.length===0&&<p>{t('local.empty')}</p>}</details>;
}
