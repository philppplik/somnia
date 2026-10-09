import {useCallback,useEffect,useRef,useState} from 'react';
import {ChevronsLeft,ChevronsRight,Download,Pause,Play,Scissors,Volume2,VolumeX} from '../../lib/icons';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {addTimelineClipsFromDialog,cancelVideoExport,deleteTimelineClip,exportVideoFile,moveTimelineClip,openVideo,selectTimelineClip,splitTimelineAt,toggleTimelineClipMute,trimTimelineClip,useVideoSession,videoIsEdited} from '../../lib/video/session';
import {blendAt,clipRanges,locate,timelineDuration} from '../../lib/video/timeline';
import {formatTime} from '../../lib/video/recipe';
import {formatBytes,getState,patchState,requestStudio,useAppStore,useMedia,type MediaItem} from './workspace-deps';
import {VideoTimeline} from './VideoTimeline';
import {VideoControls} from './VideoInspector';
const bar='media-bar flex items-center gap-2 border-b border-subtle px-3 py-1.5 text-[12px]';
/** Player, transport and the multi-clip timeline of one video project. `withPanel` adds the settings when the Video inspector is not on screen. */
export function VideoWorkspace({item,withPanel=false}:{item:MediaItem;withPanel?:boolean}){
 const {t}=useT();const studio=useAppStore().activeStudio;const session=useVideoSession(item.name);
 const media=useMedia();
 // Two slots, one per clip parity: consecutive clips always land in different elements, so a crossfade can play both at once.
 const slotA=useRef<HTMLVideoElement>(null),slotB=useRef<HTMLVideoElement>(null);
 const [playhead,setPlayhead]=useState(0),[playing,setPlaying]=useState(false),[muted,setMuted]=useState(false),[volume,setVolume]=useState(1);
 const [playable,setPlayable]=useState(true);
 const [note,setNote]=useState('');
 const playingRef=useRef(false);
 useEffect(()=>{void openVideo(item);},[item]);
 // Opening a video takes you to the Video Studio unless you picked a studio yourself.
 // The Video rail offers Files only, so do not leave the HTML Layers tree open beside video.
 useEffect(()=>{if(studio==='video'&&!['files','search'].includes(getState().leftTab))patchState({leftTab:'files'});},[studio]);
 const clips=session?.clips??[];
 const duration=timelineDuration(clips);
 const ranges=clipRanges(clips);
 const probe=session?.probe??null;
 const fps=probe?.video?.fps&&probe.video.fps>1?probe.video.fps:30;
 const entry=clips.length?locate(clips,playhead):null;
 const blend=blendAt(clips,playhead);
 const main=blend.length?blend[blend.length-1]:null;
 const slotOf=(index:number)=>index%2===0?slotA:slotB;
 // Sources of clips that lost their media tab render as missing and block the export with a clear message.
 const missing=new Set(clips.map(c=>c.source).filter((n:string)=>!media.items.some((i:MediaItem)=>i.name===n)));
 const urlOf=(source:string)=>media.items.find((i:MediaItem)=>i.name===source)?.url??item.url;
 const seek=useCallback((s:number)=>{setPlayhead(Math.min(Math.max(0,s),duration||s));},[duration]);
 // Every active slot sits on its clip's source and frame; scrubbing corrects drift over 350 ms, playback drift is left alone.
 useEffect(()=>{
  for(const e of blend){
   const el=slotOf(e.range.index).current;if(!el)continue;
   const url=urlOf(e.range.clip.source);
   if(el.dataset.slotClip!==e.range.clip.id){el.dataset.slotClip=e.range.clip.id;if(el.src!==url)el.src=url;}
   if(Math.abs(el.currentTime-e.sourceTime)>0.35)el.currentTime=e.sourceTime;
  }
  for(const slot of [slotA,slotB]){
   const el=slot.current;
   if(el&&!blend.some(e=>slotOf(e.range.index)===slot))el.pause();
  }
 },[blend,media]);
 // Play/pause follows the transport for every slot that is part of the current blend.
 useEffect(()=>{
  for(const e of blend){
   const el=slotOf(e.range.index).current;if(!el)continue;
   if(playing){if(el.paused)void el.play().catch(()=>{});}else el.pause();
  }
 },[blend,playing]);
 // Preview volume carries the equal-power fade weight so a crossfade is audible, not only visible.
 useEffect(()=>{
  for(const e of blend){
   const el=slotOf(e.range.index).current;if(!el)continue;
   el.muted=muted;el.volume=Math.min(1,Math.max(0,volume*e.audio));
  }
 },[blend,volume,muted]);
 const advance=useCallback((fromIndex:number)=>{
  const next=ranges[fromIndex+1];
  if(next){setPlayhead(next.start+0.001);}
  else{playingRef.current=false;setPlaying(false);setPlayhead(duration);}
 },[ranges,duration]);
 const pauseAll=useCallback(()=>{playingRef.current=false;setPlaying(false);slotA.current?.pause();slotB.current?.pause();},[]);
 const toggle=useCallback(()=>{
  const els=[slotA.current,slotB.current].filter((el):el is HTMLVideoElement=>!!el);
  if(els.some(el=>!el.paused)){pauseAll();return;}
  if(playhead>=duration-0.02)setPlayhead(0);
  playingRef.current=true;setPlaying(true);
 },[playhead,duration,pauseAll]);
 const step=(dir:1|-1)=>{pauseAll();seek(playhead+dir/fps);};
 const mainEl=()=>main?slotOf(main.range.index).current:null;
 // The element clock is fresher than the React playhead (timeupdate lags a frame), so cuts land where the frame actually is.
 const splitHere=useCallback(()=>{
  const el=mainEl();
  splitTimelineAt(item.name,el&&entry?entry.range.start+(el.currentTime-entry.range.clip.in_s):playhead);
 },[item.name,playhead,entry,main]);
 // The main slot drives the playhead and the boundary advance; the outgoing slot only stops at its own out point.
 const onTime=(slotIndex:number)=>(e:React.SyntheticEvent<HTMLVideoElement>)=>{
  const el=e.currentTarget;
  const mine=blend.find(x=>(x.range.index%2)===slotIndex);if(!mine)return;
  const c=mine.range.clip;
  if(main&&mine.range.index===main.range.index){
   setPlayhead(Math.min(duration,mine.range.start+(el.currentTime-c.in_s)));
   if(el.currentTime>=c.out_s-0.001)advance(mine.range.index);
  }else if(el.currentTime>=c.out_s-0.001)el.pause();
 };
 const onKey=(e:React.KeyboardEvent)=>{
  const skip=e.shiftKey?5:1;
  const selected=session?.selectedClipId??null;
  if(e.key===' '){e.preventDefault();toggle();}
  else if(e.key==='ArrowRight'&&!e.altKey){e.preventDefault();seek(playhead+skip);}
  else if(e.key==='ArrowLeft'&&!e.altKey){e.preventDefault();seek(playhead-skip);}
  else if(e.key==='i'||e.key==='o'){e.preventDefault();const el=mainEl();if(entry)trimTimelineClip(item.name,entry.range.clip.id,e.key==='i'?'in':'out',el?el.currentTime:entry.sourceTime);}
  else if(e.key==='s'||e.key==='S'){e.preventDefault();splitHere();}
  else if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();deleteTimelineClip(item.name,selected);}
  else if(e.key==='ArrowRight'&&e.altKey&&selected){e.preventDefault();moveTimelineClip(item.name,selected,1);}
  else if(e.key==='ArrowLeft'&&e.altKey&&selected){e.preventDefault();moveTimelineClip(item.name,selected,-1);}
  else if(e.key==='m'||e.key==='M'){e.preventDefault();const id=selected??entry?.range.clip.id;if(id)toggleTimelineClipMute(item.name,id);}
  else if(e.key==='Home'){e.preventDefault();seek(0);}
  else if(e.key==='End'){e.preventDefault();seek(duration);}
 };
 const doExport=async()=>{setNote('');const r=await exportVideoFile(item.name);
  if(r==='downloaded')setNote(t('video.downloaded'));else if(r==='cancelled')setNote(t('video.cancelled'));};
 const status=session?.status==='loading'?t('video.loading'):session?.status==='error'?t('video.error',{message:session.error}):'';
 const v=probe?.video;
 const edited=videoIsEdited(session);
 const exporting=session?.status==='exporting';
 const selectedClip=clips.find(c=>c.id===session?.selectedClipId)??null;
 return <section className="canvas-stage flex min-h-0 w-full flex-1 flex-col" aria-label={t('video.title')} data-testid="video-workspace" tabIndex={-1} onKeyDown={onKey}>
  <div className={bar}>
   <span className="truncate font-medium text-ink" data-testid="video-name">{item.name}</span>
   <span className="text-ink-3" data-testid="video-info">{v?t('video.info',{duration:(probe?.duration??0).toFixed(2),width:v.width,height:v.height,codec:v.codec??'?'})+(v.fps?` · ${t('video.infoFps',{fps:v.fps})}`:''):''}</span>
   {clips.length>1&&<span className="text-ink-3" data-testid="video-clip-count">{t('video.clipCount',{count:clips.length})}</span>}
   <span className="flex-1"/>
   <Button size="compact" aria-label={t('video.export')} title={t('video.exportHint')} disabled={!session||session.status!=='ready'||!clips.length||missing.size>0} onClick={()=>void doExport()} data-testid="video-export"><Download size={13}/>{t('video.export')}</Button>
  </div>
  <div className="flex min-h-0 w-full flex-1">
   <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/90" data-testid="video-stage">
     {!clips.length?<div className="grid justify-items-center gap-3 text-center text-[13px] text-white" data-testid="video-empty-timeline"><p>Your timeline is empty. Add clips to start editing.</p><Button variant="outline" onClick={()=>void addTimelineClipsFromDialog(item.name)}>Add video clips</Button></div>:playable?[slotA,slotB].map((slot,idx)=>{
      const e=blend.find(x=>(x.range.index%2)===idx);
      return <video key={idx} ref={slot} className="absolute inset-0 h-full w-full object-contain p-2" preload="auto"
       style={{opacity:e?e.video:0,visibility:e?'visible':'hidden',zIndex:e&&main&&e.range.index===main.range.index?1:0,pointerEvents:'none'}}
       onTimeUpdate={onTime(idx)} onEnded={onTime(idx)} onError={()=>setPlayable(false)}
       data-testid={idx===0?'video-player':'video-player-b'} data-clip-id={e?.range.clip.id}/>;
     }):<p className="max-w-[420px] p-4 text-center text-[13px] text-ink-2" data-testid="video-nopreview">{t('video.noPreview',{ext:session?.ext??item.name.split('.').pop()??''})}</p>}
    </div>
    <div className="flex items-center gap-3 px-4 pt-2 text-[12px] text-ink-2">
     <Button size="icon" variant="outline" aria-label={t(playing?'video.pause':'video.play')} aria-pressed={playing} disabled={!playable||!clips.length} onClick={toggle} data-testid="video-play">{playing?<Pause size={16}/>:<Play size={16}/>}</Button>
     <Button size="icon" variant="ghost" aria-label={t('video.frameBack')} disabled={!playable||!clips.length} onClick={()=>step(-1)} data-testid="video-frame-back"><ChevronsLeft size={16}/></Button>
     <Button size="icon" variant="ghost" aria-label={t('video.frameFwd')} disabled={!playable||!clips.length} onClick={()=>step(1)} data-testid="video-frame-fwd"><ChevronsRight size={16}/></Button>
     <span className="tabular-nums" data-testid="video-time">{formatTime(playhead)} / {formatTime(duration)}</span>
     <Button size="icon" variant="ghost" aria-label={t('video.split')} title={t('video.splitHint')} disabled={!entry||exporting} onClick={splitHere} data-testid="video-split"><Scissors size={16}/></Button>
     {selectedClip&&<span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] text-ink" data-testid="video-selected-chip">{t('video.selectedClip',{name:selectedClip.source.replace(/^.*[\\/]/,''),length:(selectedClip.out_s-selectedClip.in_s).toFixed(2)})}</span>}
     <span className="flex-1"/>
     <Button size="icon" variant="ghost" aria-label={t(muted?'video.unmute':'video.mute')} aria-pressed={muted} onClick={()=>setMuted(m=>!m)} data-testid="video-mute">{muted?<VolumeX size={16}/>:<Volume2 size={16}/>}</Button>
     <input type="range" className="w-20 accent-[var(--accent)]" min={0} max={1} step={0.05} value={volume} aria-label={t('video.volume')} onChange={e=>{const n=Number(e.target.value);setVolume(n);}} data-testid="video-volume"/>
    </div>
    <div className="px-4 pb-2 pt-1">
     <VideoTimeline clips={clips} selectedId={session?.selectedClipId??null} position={playhead} missing={missing}
      onSeek={seek} onSelect={id=>selectTimelineClip(item.name,id)}
      onTrim={(id,edge,at)=>trimTimelineClip(item.name,id,edge,at)}
      onMove={(id,by)=>moveTimelineClip(item.name,id,by)}
      label={t('video.timeline',{name:item.name})}/>
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
  {probe?.audio&&<span className="hidden" data-testid="video-audio-info">{t('video.audioInfo',{codec:probe.audio.codec??'?',channels:probe.audio.channels===1?t('video.mono'):probe.audio.channels===2?t('video.stereo'):t('video.channelsN',{count:probe.audio.channels}),rate:probe.audio.rate})}</span>}
  {probe&&!probe.audio&&<span className="hidden" data-testid="video-audio-info">{t('video.noAudio')}</span>}
 </section>;
}
