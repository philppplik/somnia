import {useCallback,useEffect,useRef,useState} from 'react';
import {ChevronsLeft,ChevronsRight,Download,Pause,Play,Volume2,VolumeX} from '../../lib/icons';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {cancelVideoExport,exportVideoFile,openVideo,setVideoTrim,useVideoSession,videoIsEdited} from '../../lib/video/session';
import {formatTime} from '../../lib/video/recipe';
import {formatBytes,getState,patchState,requestStudio,useAppStore,type MediaItem} from './workspace-deps';
import {VideoTimeline} from './VideoTimeline';
import {VideoControls} from './VideoInspector';
const bar='media-bar flex items-center gap-2 border-b border-subtle px-3 py-1.5 text-[12px]';
/** Player, transport, timeline with trim handles and export for one opened video file. `withPanel` adds the settings when the Video inspector is not on screen. */
export function VideoWorkspace({item,withPanel=false}:{item:MediaItem;withPanel?:boolean}){
 const {t}=useT();const studio=useAppStore().activeStudio;const session=useVideoSession(item.name);
 const video=useRef<HTMLVideoElement>(null);
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[muted,setMuted]=useState(false),[volume,setVolume]=useState(1);
 const [playable,setPlayable]=useState(true);
 const [note,setNote]=useState('');
 useEffect(()=>{void openVideo(item);},[item]);
 // Opening a video takes you to the Video Studio unless you picked a studio yourself.
 useEffect(()=>{if(studio!=='video')requestStudio('video','automatic');},[studio]);
 // The Video rail offers Files only, so do not leave the HTML Layers tree open beside video.
 useEffect(()=>{if(studio==='video'&&!['files','search'].includes(getState().leftTab))patchState({leftTab:'files'});},[studio]);
 const probe=session?.probe??null;const duration=probe?.duration??0;
 const trim=session?.recipe.trim??null;
 const fps=probe?.video?.fps&&probe.video.fps>1?probe.video.fps:30;
 const seek=useCallback((s:number)=>{const el=video.current;if(!el)return;el.currentTime=Math.min(Math.max(0,s),el.duration||s);setTime(el.currentTime);},[]);
 const toggle=useCallback(()=>{const el=video.current;if(!el)return;
  if(el.paused){if(trim&&el.currentTime>=trim.end_s-0.02)el.currentTime=trim.start_s;void el.play().catch(()=>{});}else el.pause();
 },[trim]);
 // Trim preview: playback loops inside the cut so the export range is what you review.
 useEffect(()=>{
  if(!trim)return;const el=video.current;if(!el)return;
  if(el.currentTime>=trim.end_s){el.currentTime=trim.start_s;if(!el.paused)void el.play().catch(()=>{});}
 },[time,trim]);
 const step=(dir:1|-1)=>{const el=video.current;if(!el)return;el.pause();seek(el.currentTime+dir/fps);};
 const onKey=(e:React.KeyboardEvent)=>{
  const el=video.current;if(!el)return;const skip=e.shiftKey?5:1;
  if(e.key===' '){e.preventDefault();toggle();}
  else if(e.key==='ArrowRight'){e.preventDefault();seek(el.currentTime+skip);}
  else if(e.key==='ArrowLeft'){e.preventDefault();seek(el.currentTime-skip);}
  else if(e.key==='i'||e.key==='o'){e.preventDefault();setVideoTrim(item.name,e.key==='i'?'start':'end',el.currentTime);}
  else if(e.key==='Escape'){/* clearing the trim lives in the inspector, like Sound's region chip */}
  else if(e.key==='Home'){e.preventDefault();seek(trim?.start_s??0);}
  else if(e.key==='End'){e.preventDefault();seek(trim?.end_s??duration);}
 };
 const doExport=async()=>{setNote('');const r=await exportVideoFile(item.name);
  if(r==='downloaded')setNote(t('video.downloaded'));else if(r==='cancelled')setNote(t('video.cancelled'));};
 const status=session?.status==='loading'?t('video.loading'):session?.status==='error'?t('video.error',{message:session.error}):'';
 const v=probe?.video,a=probe?.audio;
 const channels=a?(a.channels===1?t('video.mono'):a.channels===2?t('video.stereo'):t('video.channelsN',{count:a.channels})):'';
 const edited=videoIsEdited(session);
 const exporting=session?.status==='exporting';
 return <section className="canvas-stage flex min-h-0 w-full flex-1 flex-col" aria-label={t('video.title')} data-testid="video-workspace" tabIndex={-1} onKeyDown={onKey}>
  <div className={bar}>
   <span className="truncate font-medium text-ink" data-testid="video-name">{item.name}</span>
   <span className="text-ink-3" data-testid="video-info">{v?t('video.info',{duration:duration.toFixed(2),width:v.width,height:v.height,codec:v.codec??'?'})+(v.fps?` · ${t('video.infoFps',{fps:v.fps})}`:''):''}</span>
   <span className="flex-1"/>
   <Button size="compact" aria-label={t('video.export')} title={t('video.exportHint')} disabled={!session||session.status!=='ready'} onClick={()=>void doExport()} data-testid="video-export"><Download size={13}/>{t('video.export')}</Button>
  </div>
  <div className="flex min-h-0 w-full flex-1">
   <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex min-h-0 flex-1 items-center justify-center bg-black/90 p-2">
     {playable?<video ref={video} src={item.url} className="max-h-full max-w-full" muted={muted} preload="auto"
      onLoadedMetadata={e=>{e.currentTarget.volume=volume;}}
      onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
      onEnded={()=>{if(trim){seek(trim.start_s);void video.current?.play().catch(()=>{});}else{setPlaying(false);setTime(0);}}}
      onError={()=>setPlayable(false)} data-testid="video-player"/>
     :<p className="max-w-[420px] p-4 text-center text-[13px] text-ink-2" data-testid="video-nopreview">{t('video.noPreview',{ext:session?.ext??item.name.split('.').pop()??''})}</p>}
    </div>
    <div className="flex items-center gap-3 px-4 pt-2 text-[12px] text-ink-2">
     <Button size="icon" variant="outline" aria-label={t(playing?'video.pause':'video.play')} aria-pressed={playing} disabled={!playable||!probe} onClick={toggle} data-testid="video-play">{playing?<Pause size={16}/>:<Play size={16}/>}</Button>
     <Button size="icon" variant="ghost" aria-label={t('video.frameBack')} disabled={!playable||!probe} onClick={()=>step(-1)} data-testid="video-frame-back"><ChevronsLeft size={16}/></Button>
     <Button size="icon" variant="ghost" aria-label={t('video.frameFwd')} disabled={!playable||!probe} onClick={()=>step(1)} data-testid="video-frame-fwd"><ChevronsRight size={16}/></Button>
     <span className="tabular-nums" data-testid="video-time">{formatTime(time)} / {formatTime(duration)}</span>
     {trim&&<span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] text-ink" data-testid="video-trim-chip">{t('video.trimActive',{start:trim.start_s.toFixed(2),end:trim.end_s.toFixed(2),length:(trim.end_s-trim.start_s).toFixed(2)})}</span>}
     <span className="flex-1"/>
     <Button size="icon" variant="ghost" aria-label={t(muted?'video.unmute':'video.mute')} aria-pressed={muted} onClick={()=>setMuted(m=>!m)} data-testid="video-mute">{muted?<VolumeX size={16}/>:<Volume2 size={16}/>}</Button>
     <input type="range" className="w-20 accent-[var(--accent)]" min={0} max={1} step={0.05} value={volume} aria-label={t('video.volume')} onChange={e=>{const n=Number(e.target.value);setVolume(n);if(video.current)video.current.volume=n;}} data-testid="video-volume"/>
    </div>
    <div className="px-4 pb-2 pt-1">
     <VideoTimeline duration={duration} position={time} trim={trim} onSeek={seek} onTrim={(edge,at)=>setVideoTrim(item.name,edge,at)} label={t('video.timeline',{name:item.name})}/>
    </div>
    <div className="flex items-center gap-3 px-4 pb-2 text-[12px] text-ink-2">
     <span className="flex-1 truncate text-ink-3" data-testid="video-result">{session?.result?t('video.result',{duration:session.result.report.duration_s.toFixed(2),bytes:formatBytes(session.result.report.bytes),video:session.result.report.videoCodec??'',audio:session.result.report.audioCodec?` + ${session.result.report.audioCodec}`:t('video.resultAudioMuted')}):edited?'':t('video.untouched')}</span>
     {exporting?<><progress className="h-1.5 w-28 accent-[var(--accent)]" max={1} value={session.progress?.ratio} aria-label={t('video.stage.encode')} data-testid="video-progress"/><span className="text-ink-3" data-testid="video-exporting">{t('video.exporting',{percent:Math.round((session.progress?.ratio??0)*100)})}</span><Button size="compact" variant="ghost" onClick={()=>cancelVideoExport(item.name)} data-testid="video-cancel">{t('video.cancel')}</Button></>:null}
     <span role="status" aria-live="polite" className="text-ink-3" data-testid="video-note">{note}</span>
     <span role="status" aria-live="polite" className="text-ink-3" style={session?.status==='error'?{color:'var(--danger)'}:undefined} data-testid="video-status">{status}</span>
    </div>
   </div>
   {withPanel&&<aside className="w-[260px] shrink-0 overflow-auto border-l border-subtle" aria-label={t('video.panel')}><VideoControls name={item.name}/></aside>}
  </div>
  {a&&<span className="hidden" data-testid="video-audio-info">{t('video.audioInfo',{codec:a.codec??'?',channels:channels,rate:a.rate})}</span>}
  {probe&&!a&&<span className="hidden" data-testid="video-audio-info">{t('video.noAudio')}</span>}
 </section>;
}
