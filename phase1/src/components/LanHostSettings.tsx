import {useId} from 'react';
import type {LanHostSettingsValue} from '../lib/collab/lanHost';
import {useT} from '../lib/useT';
/** Controlled settings only. Rendering this never starts a listener or edits system firewall rules. */
export function LanHostSettings({value,onChange,disabled=false}:{value:LanHostSettingsValue;onChange:(next:LanHostSettingsValue)=>void;disabled?:boolean}){
 const id=useId();const {t}=useT();
 return <fieldset disabled={disabled} className="mt-3 space-y-3 text-[12px]" data-testid="lan-host-settings">
  <legend className="font-semibold">{t('share.lanSettings.title')}</legend>
  <label className="flex items-center gap-2" htmlFor={`${id}-scope`}>{t('share.lanSettings.listenOn')}
   <select id={`${id}-scope`} className="h-8 rounded-sm border border-line bg-elevated px-2" value={value.lan?'lan':'local'} onChange={e=>onChange({...value,lan:e.target.value==='lan'})}>
    <option value="local">{t('share.lanSettings.local')}</option><option value="lan">{t('share.lanSettings.network')}</option>
   </select>
  </label>
  <label className="flex items-center gap-2" htmlFor={`${id}-port`}>{t('share.lanSettings.port')}
   <input id={`${id}-port`} type="number" min={0} max={65535} step={1} className="h-8 w-24 rounded-sm border border-line bg-elevated px-2" value={Number.isNaN(value.port)?'':value.port} onChange={e=>onChange({...value,port:e.target.valueAsNumber})} aria-describedby={`${id}-port-help`}/>
  </label>
  <p id={`${id}-port-help`} className="text-[11px] text-ink-2">{t('share.lanSettings.portHelp')}</p>
  {value.lan?<p role="note" className="rounded-sm bg-hover p-2 text-[11px] text-ink-2">{t('share.lanSettings.networkWarning')}</p>:<p className="text-[11px] text-ink-2">{t('share.lanSettings.localHelp')}</p>}
 </fieldset>;
}
