import {useCollab,openShare} from '../lib/collab/store';
import {useT} from '../lib/useT';
import {roleLabel} from '../lib/collab/invite';
/** Status bar pill. Hidden when nothing is shared or joined, so the bar stays quiet. */
export function CollabStatus(){
 const {t}=useT();const {host,guest}=useCollab();
 let label:string|null=null,tone='bg-emerald-500',tab:'host'|'join'='host';
 if(guest.state!=='idle'){tab='join';
  if(guest.state==='connected')label=t('collab.joined',{role:roleLabel(guest.role??'viewer')});
  else if(guest.state==='connecting'){label=t('collab.connecting');tone='bg-amber-500';}
  else if(guest.state==='reconnecting'){label=t('collab.reconnecting');tone='bg-amber-500';}
  else {label=t('collab.notConnected');tone='bg-red-500';}}
 else if(host.state==='live'){const n=host.participants.filter(p=>p.online&&p.role!=='host').length;label=n===0?t('collab.sharing'):t('collab.sharingWith',{count:n});}
 else if(host.state==='starting'){label=t('collab.starting');tone='bg-amber-500';}
 if(!label)return null;
 return <button type="button" data-testid="collab-status" aria-label={t('collab.aria',{label})} onClick={()=>openShare(tab)} className="flex cursor-pointer items-center gap-1.5 rounded-full border-0 bg-hover px-2 py-0.5 text-[10px] text-ink"><span aria-hidden className={`size-2 rounded-full ${tone}`}/>{label}</button>;}
