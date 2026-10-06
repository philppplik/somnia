import {useId} from 'react';
import type {LanHostSettingsValue} from '../lib/collab/lanHost';
/** Controlled settings only. Rendering this never starts a listener or edits system firewall rules. */
export function LanHostSettings({value,onChange,disabled=false}:{value:LanHostSettingsValue;onChange:(next:LanHostSettingsValue)=>void;disabled?:boolean}){
 const id=useId();
 return <fieldset disabled={disabled} className="mt-3 space-y-3 text-[12px]" data-testid="lan-host-settings">
  <legend className="font-semibold">Direct connection</legend>
  <label className="flex items-center gap-2" htmlFor={`${id}-scope`}>Listen on
   <select id={`${id}-scope`} className="h-8 rounded-sm border border-line bg-elevated px-2" value={value.lan?'lan':'local'} onChange={e=>onChange({...value,lan:e.target.value==='lan'})}>
    <option value="local">This computer only (127.0.0.1)</option><option value="lan">Local network (0.0.0.0)</option>
   </select>
  </label>
  <label className="flex items-center gap-2" htmlFor={`${id}-port`}>Port
   <input id={`${id}-port`} type="number" min={0} max={65535} step={1} className="h-8 w-24 rounded-sm border border-line bg-elevated px-2" value={Number.isNaN(value.port)?'':value.port} onChange={e=>onChange({...value,port:e.target.valueAsNumber})} aria-describedby={`${id}-port-help`}/>
  </label>
  <p id={`${id}-port-help`} className="text-[11px] text-ink-2">0 chooses a free port automatically. The server starts only when you press Start sharing.</p>
  {value.lan?<p role="note" className="rounded-sm bg-hover p-2 text-[11px] text-ink-2">Windows Firewall may ask to allow Somnia. Allow only private networks you trust. Both computers need a route to the host; guest Wi-Fi, VPNs or firewall rules can block it. Somnia does not change firewall rules or open router ports. The link encrypts document content end to end; plain WebSocket does not authenticate the host. No central service is used.</p>:<p className="text-[11px] text-ink-2">Only other Somnia windows on this computer can join. Other computers cannot reach this address.</p>}
 </fieldset>;
}
