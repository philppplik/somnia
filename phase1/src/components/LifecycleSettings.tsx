import {useState} from 'react';
import {NativeButton,NativeInput,NativeSelect} from './ui/native-controls';
import {useT} from '../lib/useT';
import {readLifecycleSettings,writeLifecycleSettings} from '../lib/lifecycle/settings';
import type {ResourceProfileSetting} from '../lib/lifecycle/budgets';
import {getStudioLifecycle} from '../lib/lifecycle/integration';
import {IdbCheckpointSpill} from '../lib/lifecycle/idbSpill';
import {clearRecoveryData,recoveryDataCount} from '../lib/sessionSafety/flush';

/** Settings > Advanced > Performance: studio lifecycle opt-out and resource profile. */
export function LifecycleSettings(){
 const {t}=useT();
 const [settings,setSettings]=useState(readLifecycleSettings);
 const [cleared,setCleared]=useState(false);
 // One button: studio checkpoints (lifecycle) and recovery copies of unsaved Documents/Sheets edits (session safety). The latter can be the
 // only copy of unsaved work, so deleting them needs an explicit confirmation that names how many documents are affected.
 const clearCheckpoints=async()=>{
  const n=await recoveryDataCount().catch(()=>0);
  if(n>0&&!window.confirm(t('set.perf.clear.confirm',{n})))return;
  if(n>0)await clearRecoveryData().catch(()=>0);
  getStudioLifecycle()?.clearCheckpoints();
  if(IdbCheckpointSpill.available())void new IdbCheckpointSpill().clear().catch(()=>{});
  setCleared(true);
 };
 const apply=(patch:Parameters<typeof writeLifecycleSettings>[0])=>{
  const next=writeLifecycleSettings(patch);setSettings(next);
  if(patch.enabled===false)void getStudioLifecycle()?.disable();
 };
 const profiles:readonly ResourceProfileSetting[]=['auto','low','normal','high'];
 return <fieldset className="settings-ui-preferences" aria-label={t('set.perf.title')}>
  <h3>{t('set.perf.title')}</h3>
  <label>
   {t('set.perf.lifecycle')}
   <NativeInput type="checkbox" aria-label={t('set.perf.lifecycle')} checked={settings.enabled} onChange={e=>apply({enabled:e.target.checked})}/>
  </label>
  <p>{t('set.perf.lifecycle.hint')}</p>
  <label>
   {t('set.perf.profile')}
   <NativeSelect aria-label={t('set.perf.profile')} value={settings.profile} disabled={!settings.enabled} onChange={e=>apply({profile:e.target.value as ResourceProfileSetting})}>
    {profiles.map(id=><option key={id} value={id}>{t('set.perf.profile.'+id)}</option>)}
   </NativeSelect>
  </label>
  <p>{t('set.perf.profile.hint')}</p>
  <NativeButton type="button" onClick={()=>void clearCheckpoints()} disabled={cleared}>{cleared?t('set.perf.clear.done'):t('set.perf.clear')}</NativeButton>
  <p>{t('set.perf.clear.hint')}</p>
 </fieldset>;
}
