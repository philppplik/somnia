import {useCollab,openShare} from '../lib/collab/store';
import {roleLabel} from '../lib/collab/invite';
/** Status bar pill. Hidden when nothing is shared or joined, so the bar stays quiet. */
export function CollabStatus(){
 const {host,guest}=useCollab();
 let label:string|null=null,tone='bg-emerald-500',tab:'host'|'join'='host';
 if(guest.state!=='idle'){tab='join';
  if(guest.state==='connected')label=`Joined (${roleLabel(guest.role??'viewer')})`;
  else if(guest.state==='connecting'){label='Connecting...';tone='bg-amber-500';}
  else if(guest.state==='reconnecting'){label='Reconnecting...';tone='bg-amber-500';}
  else {label='Not connected';tone='bg-red-500';}}
 else if(host.state==='live'){const n=host.participants.filter(p=>p.online&&p.role!=='host').length;label=n===0?'Sharing':`Sharing with ${n}`;}
 else if(host.state==='starting'){label='Starting...';tone='bg-amber-500';}
 if(!label)return null;
 return <button type="button" data-testid="collab-status" aria-label={`Collaboration: ${label}. Open details`} onClick={()=>openShare(tab)} className="flex cursor-pointer items-center gap-1.5 rounded-full border-0 bg-hover px-2 py-0.5 text-[10px] text-ink"><span aria-hidden className={`size-2 rounded-full ${tone}`}/>{label}</button>;}
