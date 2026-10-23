import {useState} from 'react';
import {useT} from '../../lib/useT';
import {cutDetectedPauses,detectPauses,dismissPauseScan,useArrangement} from '../../lib/sound/arrangeStore';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';

/** mm:ss.cc for a frame count at the fixed 48 kHz session rate. */
const fmt=(frames:number)=>{const s=frames/48000;return `${Math.floor(s/60)}:${(s%60).toFixed(2).padStart(5,'0')}`;};

/** Sprach-Schnitt review: detect cuttable pauses on the rendered mix or one track, then cut all or a selection as one undoable edit. */
export function SoundPauses(){const {t}=useT(),state=useArrangement();const [source,setSource]=useState('mix');const [picked,setPicked]=useState<number[]>([]);const [error,setError]=useState('');
 const scan=state.pauseScan;
 const visible=scan&&scan.revision===state.revision&&(scan.trackId??'mix')===source?scan:null;
 const run=async()=>{setError('');setPicked([]);try{await detectPauses(source==='mix'?undefined:source);}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const cut=(indexes?:number[])=>{setError('');try{cutDetectedPauses(indexes);setPicked([]);}catch(e){setError(e instanceof Error?e.message:String(e));}};
 return <section data-testid="sound-pauses" className="space-y-2 border-t border-subtle bg-panel p-3 text-xs text-ink"><h3 className="font-medium">{t('sound.pauses.title')}</h3>
  <div className="flex flex-wrap items-center gap-2 text-ink-3"><label className="flex items-center gap-2">{t('sound.pauses.source')}<NativeSelect className="max-w-[220px] rounded border border-subtle bg-canvas px-1 py-0.5 text-ink" value={source} onChange={e=>setSource(e.target.value)} data-testid="sound-pauses-source"><option value="mix">{t('sound.analysis.fullMix')}</option>{state.document.tracks.map(track=><option key={track.id} value={track.id}>{track.name}</option>)}</NativeSelect></label>
  <Button size="compact" data-testid="sound-pauses-detect" disabled={state.pauseScanBusy||state.busy||!state.document.tracks.some(track=>track.clips.length)} onClick={()=>void run()}>{state.pauseScanBusy?t('sound.pauses.busy'):t('sound.pauses.detect')}</Button></div>
  {visible&&(visible.cuts.length?<>
   <ul className="space-y-1" data-testid="sound-pauses-list">{visible.cuts.map((c,i)=><li key={`${c.cutStart}-${c.cutEnd}`} className="flex items-center gap-2 rounded border border-subtle bg-canvas px-2 py-1">
    <NativeInput type="checkbox" className="w-auto! size-3.5 shrink-0" aria-label={`${t('sound.pauses.pause')} ${i+1}`} checked={picked.includes(i)} onChange={e=>setPicked(e.target.checked?[...picked,i]:picked.filter(x=>x!==i))}/>
    <span className="tabular-nums whitespace-nowrap">{fmt(c.cutStart)} - {fmt(c.cutEnd)}</span><span className="text-ink-3">{t('sound.pauses.duration',{seconds:(c.durationFrames/48000).toFixed(2)})}</span></li>)}</ul>
   <div className="flex flex-wrap gap-2"><Button size="compact" data-testid="sound-pauses-cut-all" disabled={state.busy} onClick={()=>cut()}>{t('sound.pauses.cutAll',{count:visible.cuts.length})}</Button><Button size="compact" data-testid="sound-pauses-cut-selected" disabled={state.busy||!picked.length} onClick={()=>cut(picked)}>{t('sound.pauses.cutSelected',{count:picked.length})}</Button><Button size="compact" onClick={()=>{dismissPauseScan();setPicked([]);}}>{t('sound.pauses.dismiss')}</Button></div>
  </>:<p className="text-ink-3" data-testid="sound-pauses-none">{t('sound.pauses.none')}</p>)}
  {scan&&!visible&&<p className="text-ink-3">{t('sound.pauses.stale')}</p>}
  {error&&<p role="alert" className="text-danger">{error}</p>}</section>;
}
