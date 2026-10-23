import {useEffect,useState} from 'react';
import {useT} from '../../lib/useT';
import {cutSelectedSegments,detectSegments,dismissSegmentScan,useArrangement} from '../../lib/sound/arrangeStore';
import {segmentCapability,transcribeSegments,type SegmentCapability} from '../../lib/sound/segmentTranscript';
import {type VoiceLanguage} from '../../lib/agent/voicePreview';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';

/** mm:ss.cc for a frame count at the fixed 48 kHz session rate. */
const fmt=(frames:number)=>{const s=frames/48000;return `${Math.floor(s/60)}:${(s%60).toFixed(2).padStart(5,'0')}`;};

/**
 * Transcript-guided review (Stage C3): segment the rendered mix or one track with the pinned local
 * voice model, review segments, cut the picked ones as one undoable edit. Filler-only segments are
 * PRE-CHECKED as a suggestion; cutting happens only on emitted segment boundaries and only after
 * the user confirms. Hidden unless the local voice model is actually ready on this platform.
 */
export function SoundSegments(){const {t}=useT(),state=useArrangement();
 const [capability,setCapability]=useState<SegmentCapability|null>(null);
 const [source,setSource]=useState('mix');const [language,setLanguage]=useState<VoiceLanguage>('de');
 const [picked,setPicked]=useState<number[]|null>(null);const [error,setError]=useState('');
 useEffect(()=>{let valid=true;void segmentCapability().then(c=>{if(valid)setCapability(c);}).catch(()=>{if(valid)setCapability({ready:false,reason:'helper-missing'});});return()=>{valid=false};},[]);
 const scan=state.segmentScan;
 useEffect(()=>{setPicked(null);},[scan]);
 if(!capability?.ready)return null;
 const visible=scan&&scan.revision===state.revision&&(scan.trackId??'mix')===source?scan:null;
 const suggested=visible?visible.segments.map((s,i)=>s.fillerOnly?i:-1).filter(i=>i>=0):[];
 const selected=picked??suggested;
 const run=async()=>{setError('');setPicked(null);try{await detectSegments(source==='mix'?undefined:source,(pcm,signal)=>transcribeSegments(pcm,language,signal));}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const cut=()=>{setError('');try{cutSelectedSegments(selected);setPicked(null);}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const toggle=(i:number,on:boolean)=>setPicked(on?[...selected,i]:selected.filter(x=>x!==i));
 return <section data-testid="sound-segments" className="space-y-2 border-t border-subtle bg-panel p-3 text-xs text-ink"><h3 className="font-medium">{t('sound.segments.title')}</h3>
  <p className="text-ink-3">{t('sound.segments.note')}</p>
  <div className="flex flex-wrap items-center gap-2 text-ink-3"><label className="flex items-center gap-2">{t('sound.pauses.source')}<NativeSelect className="max-w-[220px] rounded border border-subtle bg-canvas px-1 py-0.5 text-ink" value={source} onChange={e=>setSource(e.target.value)} data-testid="sound-segments-source"><option value="mix">{t('sound.analysis.fullMix')}</option>{state.document.tracks.map(track=><option key={track.id} value={track.id}>{track.name}</option>)}</NativeSelect></label>
  <label className="flex items-center gap-2">{t('sound.segments.language')}<NativeSelect className="rounded border border-subtle bg-canvas px-1 py-0.5 text-ink" value={language} onChange={e=>setLanguage(e.target.value as VoiceLanguage)} data-testid="sound-segments-language"><option value="de">Deutsch</option><option value="en">English</option></NativeSelect></label>
  <Button size="compact" data-testid="sound-segments-detect" disabled={state.segmentScanBusy||state.busy||!state.document.tracks.some(track=>track.clips.length)} onClick={()=>void run()}>{state.segmentScanBusy?t('sound.segments.busy'):t('sound.segments.detect')}</Button></div>
  {visible&&(visible.segments.length?<>
   <ul className="space-y-1" data-testid="sound-segments-list">{visible.segments.map((seg,i)=><li key={`${seg.fromMs}-${seg.toMs}-${i}`} className="flex items-center gap-2 rounded border border-subtle bg-canvas px-2 py-1">
    <NativeInput type="checkbox" className="w-auto! size-3.5 shrink-0" aria-label={`${t('sound.segments.segment')} ${i+1}`} checked={selected.includes(i)} onChange={e=>toggle(i,e.target.checked)}/>
    <span className="tabular-nums whitespace-nowrap">{fmt(seg.fromFrame)} - {fmt(seg.toFrame)}</span><span className="min-w-0 flex-1 truncate" title={seg.text}>{seg.text}</span>{seg.fillerOnly&&<span className="rounded bg-accent-soft px-1 text-[10px] text-accent" data-testid="sound-segments-filler">{t('sound.segments.suggestion')}</span>}</li>)}</ul>
   <div className="flex flex-wrap gap-2"><Button size="compact" data-testid="sound-segments-cut" disabled={state.busy||!selected.length} onClick={cut}>{t('sound.segments.cutSelected',{count:selected.length})}</Button><Button size="compact" onClick={()=>{dismissSegmentScan();setPicked(null);}}>{t('sound.pauses.dismiss')}</Button></div>
  </>:<p className="text-ink-3" data-testid="sound-segments-none">{t('sound.segments.none')}</p>)}
  {scan&&!visible&&<p className="text-ink-3">{t('sound.pauses.stale')}</p>}
  {error&&<p role="alert" className="text-danger" data-testid="sound-segments-error">{error}</p>}</section>;
}
