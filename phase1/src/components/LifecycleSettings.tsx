import {useState} from 'react';
import {useT} from '../lib/useT';
import {readLifecycleSettings,writeLifecycleSettings} from '../lib/lifecycle/settings';
import type {ResourceProfileSetting} from '../lib/lifecycle/budgets';
import {getStudioLifecycle} from '../lib/lifecycle/integration';

/** Settings > Advanced > Performance: studio lifecycle opt-out and resource profile. */
export function LifecycleSettings(){
 const {t}=useT();
 const [settings,setSettings]=useState(readLifecycleSettings);
 const apply=(patch:Parameters<typeof writeLifecycleSettings>[0])=>{
  const next=writeLifecycleSettings(patch);setSettings(next);
  if(patch.enabled===false)void getStudioLifecycle()?.disable();
 };
 const profiles:readonly ResourceProfileSetting[]=['auto','low','normal','high'];
 return <fieldset className="settings-ui-preferences" aria-label={t('set.perf.title')}>
  <h3>{t('set.perf.title')}</h3>
  <label>
   {t('set.perf.lifecycle')}
   <input type="checkbox" aria-label={t('set.perf.lifecycle')} checked={settings.enabled} onChange={e=>apply({enabled:e.target.checked})}/>
  </label>
  <p>{t('set.perf.lifecycle.hint')}</p>
  <label>
   {t('set.perf.profile')}
   <select aria-label={t('set.perf.profile')} value={settings.profile} disabled={!settings.enabled} onChange={e=>apply({profile:e.target.value as ResourceProfileSetting})}>
    {profiles.map(id=><option key={id} value={id}>{t('set.perf.profile.'+id)}</option>)}
   </select>
  </label>
  <p>{t('set.perf.profile.hint')}</p>
 </fieldset>;
}
