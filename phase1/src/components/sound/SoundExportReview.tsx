import {useEffect,useState,useRef} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../ui/dialog';
import {Button} from '../ui/button';
import {useMedia} from '../../lib/media';
import {useT} from '../../lib/useT';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {activeSoundName,registerSoundExportOpener} from '../../lib/sound/commands';
import {getSoundSession,isSoundExportReady,useSoundSession} from '../../lib/sound/session';
/** Clip identity and processed generation remain owned by the Sound session. */
export function SoundExportReview(){
 const {t}=useT();const media=useMedia();const returnFocus=useRef<HTMLElement|null>(null);
 const [name,setName]=useState<string|null>(null),[invalid,setInvalid]=useState(false),[outcome,setOutcome]=useState(''),[saving,setSaving]=useState(false);
 const s=useSoundSession(name);const report=s?.processed?.report.output;
 useEffect(()=>registerSoundExportOpener(n=>{returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setName(n);setOutcome('');setInvalid(false);}),[]);
 useEffect(()=>{if(name&&media.active!==name)setInvalid(true);},[name,media.active]);
 const ready=!!s&&isSoundExportReady(name)&&activeSoundName()===name&&!invalid&&!saving;
 const submit=async()=>{
  if(!ready||getSoundSession(name)?.processed!==s?.processed||getSoundSession(name)?.settings!==s?.settings)return;
  setSaving(true);setOutcome('');
  try{setOutcome(await commandDispatcher.runCommand<string>('sound.export'));}catch{setOutcome('failed');}finally{setSaving(false);}
 };
 return <Dialog open={!!name} onOpenChange={o=>{if(!o&&!saving)setName(null);}}><DialogContent finalFocus={()=>returnFocus.current?.isConnected?returnFocus.current:document.querySelector<HTMLElement>('[data-testid="hero-action-main"]')} className="dlg-popup" data-testid="sound-export-review">
  <header className="dlg-head"><div><DialogTitle>{t('sound.hero.export')}</DialogTitle><DialogDescription>{t('sound.review.scope')}</DialogDescription></div></header>
  <div className="dlg-body grid gap-3 text-sm"><strong>{name}</strong><p>{t('sound.review.wav')}</p>
   {report&&<p>{report.duration_s.toFixed(2)} s · {report.channels} {t('sound.review.channels')} · {report.sample_rate} Hz</p>}
   {s?.settings.region&&<p>{t('sound.review.region')} {s.settings.region.mode} ({s.settings.region.start.toFixed(2)} - {s.settings.region.end.toFixed(2)} s)</p>}
   {s?.listen==='original'&&<><p>{t('sound.review.edited')}</p><Button variant="outline" disabled={!ready} onClick={()=>void commandDispatcher.runCommand('sound.listen',{version:'processed'})}>{t('sound.review.listen')}</Button></>}
   {!ready&&!saving&&<p role="status">{s?.error||t(invalid||activeSoundName()!==name?'sound.review.changed':'sound.review.wait')}</p>}
   {outcome&&<p role="status">{t('sound.review.'+outcome)}</p>}
  </div><footer className="dlg-foot"><Button variant="outline" disabled={saving} onClick={()=>setName(null)}>{t('sound.review.close')}</Button><Button variant="primary" disabled={!ready} onClick={()=>void submit()}>{t('sound.review.submit')}</Button></footer>
 </DialogContent></Dialog>;
}
