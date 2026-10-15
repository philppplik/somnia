import {useState} from 'react';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {getVideoSession} from '../../lib/video/session';
import {getMedia,useMedia} from '../../lib/media';
import {useVideoSession} from '../../lib/video/session';
import {clipDuration,clipRanges,fadeOf,MAX_GAIN,timelineDuration,CLIP_TRANSITIONS,transitionOf,type ClipTransition} from '../../lib/video/timeline';
import {clipDisplayName,isTitleClip,needsSourceFile} from '../../lib/video/titles';
import {formatTime} from '../../lib/video/recipe';
import {executeCommand} from '../../lib/commands';
import {useT} from '../../lib/useT';
import {usePanelState} from '../../store/panelStateStore';
import type {PanelHostProps,InspectorSectionProps} from '../../lib/shell/types';
import {Button} from '../ui/button';
import {TitleInspector} from './TitleInspector';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
const run=(id:string,params?:unknown)=>void executeCommand(id,params);
function useActive(){const media=useMedia();const s=useVideoSession(media.active);return {media,s,selected:s?.clips.find(c=>c.id===s.selectedClipId),ready:s?.status==='ready'};}
export function SourcesPanel({context,panelId}:PanelHostProps){
 const {t}=useT();const {media,s,ready}=useActive();
 const [filter,setFilter]=usePanelState<string>(`${context.studio}.${panelId}.filter`,'');
 const items=media.items.filter(i=>i.kind==='video'&&i.name.toLowerCase().includes(filter.toLowerCase()));
 return <aside className="grid min-h-0 content-start gap-3 p-3 text-xs" data-testid="video-sources-panel">
  <Button size="compact" variant="outline" disabled={!ready} onClick={()=>run('video.source.open')} data-testid="video-source-open">{t('video.addOpen')}</Button>
  <NativeInput className={field} value={filter} placeholder={t('video.shell.filter')} aria-label={t('video.shell.filter')} onChange={e=>setFilter(e.target.value)}/>
  {!items.length&&<p className="text-ink-3">{t('video.shell.noSources')}</p>}
  <ul className="m-0 grid list-none gap-2 p-0">{items.map(item=><li key={item.name} className="grid gap-2 rounded-sm border border-subtle p-2">
   <span className="truncate text-ink" title={item.name}>{item.name}</span>
   <span className="text-ink-3">{t('video.shell.used',{count:s?.clips.filter(c=>c.source===item.name).length??0})}</span>
   <Button size="compact" variant="outline" disabled={!ready} onClick={()=>run('video.source.add',{name:item.name})} data-testid="video-source-add">{t('video.addClip')}</Button>
  </li>)}</ul>
 </aside>;
}
export function SequencePanel(_:PanelHostProps){
 const {t}=useT();const {s,ready}=useActive();
 const ranges=clipRanges(s?.clips??[]);
 const selected=ranges.find(r=>r.clip.id===s?.selectedClipId);
 return <aside className="grid min-h-0 content-start gap-3 p-3 text-xs" data-testid="video-sequence-panel">
  <span className="text-ink-3" data-testid="video-timeline-summary">{t('video.timelineSummary',{count:s?.clips.length??0,duration:timelineDuration(s?.clips??[]).toFixed(2)})}</span>
  <Button size="compact" variant="outline" disabled={!ready} onClick={()=>run('video.title.add')} data-testid="video-add-title">{t('video.card.add')}</Button>
  {!ranges.length&&<p className="text-ink-3">{t('video.shell.empty')}</p>}
  <ol className="m-0 grid list-none gap-1 p-0">{ranges.map(({clip,start,end},index)=><li key={clip.id}>
   <NativeButton type="button" className={'grid w-full gap-1 rounded-sm border px-2 py-2 text-left hover:bg-hover '+(s?.selectedClipId===clip.id?'border-accent bg-accent-soft text-accent':'border-transparent text-ink-2')} aria-pressed={s?.selectedClipId===clip.id} disabled={!ready} onClick={()=>run('video.clip.select',{id:clip.id})} data-testid="video-sequence-clip">
    <span className="truncate">{index+1}. {clipDisplayName(clip,clip.source.replace(/^.*[\\/]/,''))}</span>
    <span className="text-[11px] tabular-nums text-ink-3">{formatTime(start)} - {formatTime(end)}</span>
   </NativeButton>
  </li>)}</ol>
  <Button size="compact" variant="outline" disabled={!ready||!selected||clipDuration(selected.clip)<0.1} onClick={()=>run('video.timeline.split',{seconds:selected!.start+clipDuration(selected!.clip)/2})}>{t('video.shell.splitHalf')}</Button>
  <Button size="compact" variant="ghost" disabled={!ready||!ranges.length} onClick={()=>run('video.timeline.reset')} data-testid="video-reset">{t('video.reset')}</Button>
  <p className="m-0 text-ink-3">{t('video.note')}</p>
 </aside>;
}
export function VideoDocumentSection(_:InspectorSectionProps){
 const {t}=useT();const {s}=useActive();const p=s?.probe;
 return <div className="grid gap-2 text-xs text-ink-3" data-testid="video-facts">
  {!s?<p>{t('video.shell.empty')}</p>:<>
   <span className="break-all text-ink">{s.name}</span>
   {s.status==='loading'&&<p>{t('video.loading')}</p>}
   {s.error&&<p role="alert">{t('video.error',{message:s.error})}</p>}
   {p?.video&&<span>{t('video.info',{duration:p.duration.toFixed(2),width:p.video.width,height:p.video.height,codec:p.video.codec??'?'})}</span>}
   {p?.video?.fps&&<span>{t('video.infoFps',{fps:p.video.fps})}</span>}
   <span>{t('video.timelineSummary',{count:s.clips.length,duration:timelineDuration(s.clips).toFixed(2)})}</span>
   <span data-testid="video-facts-audio">{p?.audio?t('video.audioInfo',{codec:p.audio.codec??'?',channels:p.audio.channels,rate:p.audio.rate}):t('video.noAudio')}</span>
  </>}
 </div>;
}
export function VideoSelectionSection(_:InspectorSectionProps){
 const {t}=useT();const {s,selected,ready}=useActive();if(!s||!selected)return null;
 const index=s.clips.findIndex(c=>c.id===selected.id);
 return <fieldset disabled={!ready} className="m-0 grid min-w-0 gap-3 border-0 p-0 text-xs text-ink-2" data-testid="video-clip-panel">
  {isTitleClip(selected)?<TitleInspector clip={selected} onChange={p=>run('video.title.update',p)} onDuration={seconds=>run('video.title.duration',{seconds})}/>:<>
   <span className="break-all" data-testid="video-clip-source">{selected.source}</span>
   <div className="grid grid-cols-2 gap-2">{(['in','out'] as const).map(edge=><label key={edge}>{t(edge==='in'?'video.trimStart':'video.trimEnd')}
    <NativeInput className={field} type="number" min={0} step={0.01} value={edge==='in'?selected.in_s:selected.out_s} onChange={e=>run('video.clip.trim',{edge,seconds:Number(e.target.value)})} data-testid={'video-clip-'+edge+'-input'}/>
   </label>)}</div>
  </>}
  <div className="flex flex-wrap gap-2">
   <Button size="compact" variant="outline" disabled={index===0} onClick={()=>run('video.clip.move',{by:-1})} data-testid="video-clip-left">{t('video.moveLeft')}</Button>
   <Button size="compact" variant="outline" disabled={index===s.clips.length-1} onClick={()=>run('video.clip.move',{by:1})} data-testid="video-clip-right">{t('video.moveRight')}</Button>
   <Button size="compact" variant="ghost" disabled={s.clips.length<=1&&getKind(s.name)!=='video-project'} onClick={()=>run('video.clip.delete')} data-testid="video-clip-delete">{t('video.deleteClip')}</Button>
   <Button size="compact" variant="ghost" onClick={()=>run('video.clip.deselect')}>{t('video.shell.deselect')}</Button>
  </div>
 </fieldset>;
}
const TRANSITION_LABELS:Record<ClipTransition,string>={dissolve:'video.transitionKind.dissolve','wipe-l':'video.transitionKind.wipeL','wipe-r':'video.transitionKind.wipeR','wipe-t':'video.transitionKind.wipeT','wipe-b':'video.transitionKind.wipeB','slide-l':'video.transitionKind.slideL','slide-r':'video.transitionKind.slideR','slide-t':'video.transitionKind.slideT','slide-b':'video.transitionKind.slideB'};
const getKind=(name:string)=>getMedia().items.find(i=>i.name===name)?.kind;
export function VideoAudioSection(_:InspectorSectionProps){
 const {t}=useT();const {s,selected,ready}=useActive();if(!s||!selected)return null;
 const next=s.clips[s.clips.findIndex(c=>c.id===selected.id)+1];
 return <fieldset disabled={!ready} className="m-0 grid min-w-0 gap-3 border-0 p-0 text-xs text-ink-2">
  {!isTitleClip(selected)&&<>
   <label className="grid gap-2">{t('video.gain',{percent:Math.round(selected.gain*100)})}<NativeInput type="range" className="w-full accent-[var(--accent)]" min={0} max={MAX_GAIN} step={0.05} value={selected.gain} onChange={e=>run('video.clip.gain',{gain:Number(e.target.value)})} data-testid="video-clip-gain"/></label>
   <label className="flex items-center gap-2"><NativeInput type="checkbox" className="!size-4 !w-4 accent-[var(--accent)]" checked={selected.muted} onChange={()=>run('video.clip.mute')} data-testid="video-clip-mute"/>{t('video.clipMute')}</label>
  </>}
  {next?<>
   <label>{t('video.transition')}<NativeInput className={field} type="number" min={0} max={Math.min(clipDuration(selected),clipDuration(next))} step={0.1} value={fadeOf(selected)} onChange={e=>run('video.clip.crossfade',{seconds:Number(e.target.value)})} data-testid="video-clip-transition-duration"/></label>
   <label>{t('video.transitionStyle')}<NativeSelect className={field} value={transitionOf(selected)} onChange={e=>run('video.clip.transition',{transition:e.target.value as ClipTransition})} data-testid="video-clip-transition-style">{CLIP_TRANSITIONS.map(tr=><option key={tr} value={tr}>{t(TRANSITION_LABELS[tr])}</option>)}</NativeSelect></label>
  </>:<p className="m-0 text-ink-3">{t('video.shell.lastClip')}</p>}
 </fieldset>;
}
export function VideoExportSection({reviewName}:InspectorSectionProps&{reviewName?:string}){
 const {t}=useT();const {s,media,ready}=useActive();const [ack,setAck]=useState(''),[outcome,setOutcome]=useState('');if(!s)return null;
 const signature=JSON.stringify([s.name,s.clips,s.format]);
 const audio=s.clips.some(c=>needsSourceFile(c)&&!c.muted&&c.gain>0&&!!getVideoSession(c.source)?.probe?.audio);
 const silent=audio&&!(s.format==='mp4'?s.capabilities?.aac:s.capabilities?.opus);
 const submit=async()=>{
  if(media.active!==reviewName||getVideoSession(reviewName)?.clips!==s.clips||getVideoSession(reviewName)?.format!==s.format||silent&&ack!==signature)return;
  setOutcome('');try{setOutcome(await commandDispatcher.runCommand<string>('video.export.start'));}catch{setOutcome('failed');}
 };
 const missing=s.clips.some(c=>needsSourceFile(c)&&!media.items.some(i=>i.name===c.source));
 const supported=!!(s.format==='webm'?s.capabilities?.webmVideo:s.capabilities?.mp4Video);
 return <div className="grid gap-3 text-xs text-ink-2" data-testid="video-format">
  {(['webm','mp4'] as const).map(format=><label key={format} className="flex items-center gap-2"><NativeInput className="!size-4 !w-4 accent-[var(--accent)]" type="radio" name="video-shell-format" checked={s.format===format} disabled={!ready||!(format==='webm'?s.capabilities?.webmVideo:s.capabilities?.mp4Video)} onChange={()=>run('video.export.format',{format})} data-testid={'video-format-'+format}/>{t(format==='mp4'&&s.capabilities&&!s.capabilities.aac?'video.format.mp4NoAudio':'video.format.'+format)}</label>)}
  {reviewName&&<p>{t('video.review.duration',{seconds:timelineDuration(s.clips).toFixed(2)})}</p>}
  {reviewName&&silent&&<label className="flex gap-2"><NativeInput type="checkbox" checked={ack===signature} onChange={e=>setAck(e.target.checked?signature:'')}/>{t('video.review.silent')}</label>}
  {s.error&&<p role="alert">{s.error}</p>}
  {!ready&&s.status!=='exporting'&&<p role="status">{t('video.review.wait')}</p>}
  {!s.clips.length&&<p>{t('video.review.empty')}</p>}
  {outcome&&<p role="status">{t('video.review.'+outcome)}</p>}
  {!supported&&<p className="m-0 text-ink-3">{t('video.format.unavailable')}</p>}
  {missing&&<p role="alert">{t('video.shell.missing')}</p>}
  {s.status==='exporting'?<><progress className="w-full accent-[var(--accent)]" max={1} value={s.progress?.ratio} aria-label={t('video.export')}/><Button size="compact" onClick={()=>run('video.export.cancel')}>{t('video.cancel')}</Button></>:<Button variant="primary" size="compact" disabled={!ready||!s.clips.length||missing||!supported||!!reviewName&&silent&&ack!==signature} onClick={()=>reviewName?void submit():run('video.export.open')} data-testid="video-shell-export">{t('video.export')}</Button>}
  {s.result&&<p className="m-0 text-ink-3" data-testid="video-result-inspector">{t('video.result',{duration:s.result.report.duration_s.toFixed(2),bytes:(s.result.report.bytes/1024).toFixed(0)+' KB',video:s.result.report.videoCodec??'',audio:s.result.report.audioCodec??t('video.resultAudioMuted')})}</p>}
 </div>;
}
