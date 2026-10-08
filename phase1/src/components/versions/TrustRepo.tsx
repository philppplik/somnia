import {useState} from 'react';
import {ShieldCheck} from 'lucide-react';
import {ConfirmShell} from '../ConfirmShell';
import {Button} from '../ui/button';
/** Asks once before Git runs in a folder Somnia did not create. Calls backend.trustRepo on confirm. */
export function TrustRepo({t,onTrust}:{t:(k:string)=>string;onTrust:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[err,setErr]=useState(false);
 const go=async()=>{setBusy(true);setErr(false);try{await onTrust();setOpen(false);}catch{setErr(true);}finally{setBusy(false);}};
 return <><Button variant="primary" size="normal" onClick={()=>setOpen(true)} data-testid="versions-trust">{t('versions.trust.button')}</Button>
  <ConfirmShell open={open} onCancel={()=>setOpen(false)} busy={busy} tone="warning" Icon={ShieldCheck} ariaLabel={t('versions.trust.title')} title={t('versions.trust.title')} description={t('versions.trust.desc')}
   body={err?<p role="alert" className="text-xs text-ink">{t('versions.compare.error')}</p>:null}
   footer={<><Button onClick={()=>setOpen(false)} disabled={busy}>{t('versions.trust.cancel')}</Button><Button variant="primary" onClick={()=>void go()} disabled={busy} data-testid="versions-trust-confirm">{t('versions.trust.confirm')}</Button></>}/></>;}
