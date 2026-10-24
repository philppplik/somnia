import {useState,useSyncExternalStore} from 'react';
import {getLocale,subscribeLocale,t} from '../../lib/i18n';
import {defaultSchedule,scheduleError,scheduleFingerprint,type ScheduleSpec,type ScheduleTransport,type SchedulePreview} from '../../lib/vibespace/schedule';
import './schedule.css';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
export function ScheduleDialog({studioId,transport,onClose,onSaved}:{studioId:string;transport:ScheduleTransport;onClose:()=>void;onSaved?:()=>void}){
 const locale=useSyncExternalStore(subscribeLocale,getLocale,getLocale);
 const [spec,setSpec]=useState(()=>defaultSchedule(studioId));
 const [preview,setPreview]=useState<{key:string;value:SchedulePreview}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const edit=(changes:Partial<ScheduleSpec>)=>{setSpec(s=>({...s,...changes}));setError('');};
 const invalid=scheduleError(spec),key=scheduleFingerprint(spec);
 const currentPreview=preview?.key===key?preview.value:null;
 const label=(k:string)=>t(`vs.schedule.${k}`);
 const read=async()=>{
  if(invalid||busy)return;
  setBusy(true);setError('');
  try{const value=await transport.preview(spec);setPreview({key,value});}catch{setPreview(null);setError(label('failed'));}finally{setBusy(false);}
 };
 const save=async()=>{
  if(invalid||busy||!currentPreview)return;
  setBusy(true);setError('');
  try{await transport.create(spec);onSaved?.();onClose();}catch{setError(label('failed'));}finally{setBusy(false);}
 };
 return <section className="vs-schedule" role="dialog" aria-labelledby="schedule-title" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <h2 id="schedule-title">{label('title')}</h2>
  <form onSubmit={e=>{e.preventDefault();void save();}}>
   <fieldset disabled={busy}><label>{label('name')}<NativeInput maxLength={200} value={spec.name} onChange={e=>edit({name:e.target.value})}/></label>
   <label>{label('cron')}<NativeInput value={spec.cronExpr} onChange={e=>edit({cronExpr:e.target.value})} spellCheck={false}/></label>
   <label>{label('timezone')}<NativeInput value={spec.timezone} onChange={e=>edit({timezone:e.target.value})} spellCheck={false}/></label>
   <label>{label('misfire')}<NativeSelect aria-label={label('misfire')} value={spec.misfirePolicy.kind} onChange={e=>edit({misfirePolicy:e.target.value==='catch_up'?{kind:'catch_up',cap:5}:{kind:e.target.value as 'skip'|'coalesce'}})}><option value="skip">{label('skip')}</option><option value="coalesce">{label('coalesce')}</option><option value="catch_up">{label('catchUp')}</option></NativeSelect></label>
   {spec.misfirePolicy.kind==='catch_up'&&<label>{label('cap')}<NativeInput type="number" min={1} max={100} value={spec.misfirePolicy.cap} onChange={e=>edit({misfirePolicy:{kind:'catch_up',cap:Number(e.target.value)}})}/></label>}
   <label>{label('consent')}<NativeSelect aria-label={label('consent')} value={spec.consentLevel} onChange={e=>edit({consentLevel:e.target.value as ScheduleSpec['consentLevel'],autoApply:false})}><option value="ask_for_everything">{label('askEverything')}</option><option value="ask_for_writes">{label('askWrites')}</option><option value="autonomous_in_scope">{label('inScope')}</option></NativeSelect></label>
   <label className="vs-schedule-check"><NativeInput type="checkbox" checked={spec.autoApply} disabled={spec.consentLevel!=='autonomous_in_scope'} onChange={e=>edit({autoApply:e.target.checked})}/>{label('autoApply')}</label>
   </fieldset>
   <p className="vs-notice">{label('warning')}</p><p>{label('appOpen')}</p>
   {invalid&&<p role="status">{label(invalid==='cap'?'capError':invalid)}</p>}
   {error&&<p role="alert">{error}</p>}
   <NativeButton type="button" disabled={busy||!!invalid} onClick={()=>void read()}>{label('preview')}</NativeButton>
   {currentPreview?<section aria-label={label('next')}><p>{currentPreview.description}</p><h3>{label('next')}</h3><ol>{currentPreview.nextFireTimes.map(time=><li key={time}><time dateTime={new Date(time).toISOString()}>{new Intl.DateTimeFormat(locale,{timeZone:spec.timezone,dateStyle:'full',timeStyle:'short'}).format(time)}</time></li>)}</ol></section>:<p>{label('previewRequired')}</p>}
   <div className="vs-actions"><NativeButton type="submit" disabled={busy||!!invalid||!currentPreview}>{label(busy?'saving':'save')}</NativeButton><NativeButton type="button" disabled={busy} onClick={onClose}>{label('cancel')}</NativeButton></div>
  </form>
 </section>;
}
