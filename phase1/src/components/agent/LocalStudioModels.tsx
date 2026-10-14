import {NativeSelect} from '../ui/native-controls';
import {Field} from '../ui/field';
import {useState} from 'react';
import {listStudios} from '../../lib/studios/registry';
import {LocalModelsRuntime} from '../../lib/agent/localModels';
import type {LocalRuntimePreferences} from '../../lib/agent/settings';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
export function LocalStudioModels({value,onChange,disabled}:{value:LocalRuntimePreferences|undefined;onChange:(p:LocalRuntimePreferences)=>void;disabled:boolean}){
 const {t}=useT();const [models,setModels]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refresh=async()=>{setBusy(true);setError('');try{const runtime=new LocalModelsRuntime(),snapshot=await runtime.snapshot();if(snapshot.inventoryError||snapshot.state!=='running')throw Error(t('local.inventoryError'));const allowed:string[]=[];for(const row of snapshot.models){const evidence=await runtime.evidence(row.id);if(evidence.locality==='reported-local'&&evidence.capabilities?.includes('tools')&&await runtime.verify(row.id))allowed.push(row.id);}setModels(allowed);}catch(e){setError(e instanceof Error?e.message:t('local.action.failed'));}finally{setBusy(false);}};
 return <details className="local-runtime-discovery"><summary>{t('local.routing.title')}</summary><p>{t('local.routing.boundary')}</p><Button type="button" disabled={busy||disabled} onClick={()=>void refresh()}>{t('local.refresh')}</Button>{error&&<p role="alert">{error}</p>}{listStudios().map(studio=><Field key={studio.id} label={studio.id}>{control=><NativeSelect {...control} disabled={disabled||busy} value={value?.studioModels?.[studio.id]??''} onChange={e=>{const studioModels={...value?.studioModels};if(e.target.value)studioModels[studio.id]=e.target.value;else delete studioModels[studio.id];onChange({...value,version:1,studioModels});}}><option value="">{t('local.routing.inherit')}</option>{value?.studioModels?.[studio.id]&&!models.includes(value.studioModels[studio.id])&&<option value={value.studioModels[studio.id]}>{value.studioModels[studio.id]} ({t('local.locality.unverified')})</option>}{models.map(model=><option key={model} value={model}>{model}</option>)}</NativeSelect>}</Field>)}</details>;
}
