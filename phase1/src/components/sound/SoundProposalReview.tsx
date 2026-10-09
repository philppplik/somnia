import {useEffect,useMemo,useState} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {diffSound} from '../../lib/agent/soundReview';
import {parseSound} from '../../lib/agent/soundStudio';
import {renderSoundPreview} from '../../lib/sound/session';
/** Review body for an AI sound proposal: what changes, and an audible render of the proposed settings. Applying stays with the host. */
export function SoundProposalReview({name,beforeText,afterText}:{name:string;beforeText:string;afterText:string}){
 const {t}=useT();
 const changes=useMemo(()=>{try{return diffSound(beforeText,afterText);}catch{return null;}},[beforeText,afterText]);
 const [url,setUrl]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{setUrl('');setError('');},[afterText]);
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 const label=(id:string)=>id.startsWith('effect.')?t('sound.review.param',{name:id.slice(7)}):t(`sound.review.${id}`);
 const preview=async()=>{setBusy(true);setError('');try{setUrl(await renderSoundPreview(name,parseSound(afterText)));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 return <div className="grid gap-2 text-xs text-ink-2" data-testid="sound-review">
  {changes===null?<p className="m-0" role="alert">{t('sound.review.invalid')}</p>
  :changes.length===0?<p className="m-0">{t('sound.review.none')}</p>
  :<ul className="m-0 grid list-none gap-1 p-0">{changes.map(c=><li key={c.id} className="flex justify-between gap-2" data-testid={`sound-review-${c.id}`}><span className="text-ink">{label(c.id)}</span><span className="text-ink-3">{c.before} → {c.after}</span></li>)}</ul>}
  <div className="flex items-center gap-2">
   <Button size="compact" disabled={busy||changes===null||changes.length===0} onClick={()=>void preview()} data-testid="sound-review-preview">{busy?t('sound.processing'):t('sound.review.preview')}</Button>
   {url?<audio controls src={url} className="h-8 min-w-0 flex-1" data-testid="sound-review-audio"/>:null}
  </div>
  {error?<p className="m-0" role="alert" style={{color:'var(--danger)'}}>{t('sound.error',{message:error})}</p>:null}
 </div>;
}
