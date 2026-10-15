import {useCallback,useEffect,useRef,useState} from 'react';
import {ChevronsLeft,ChevronsRight,Download,Pause,Play,Redo2,RotateCcw,Scissors,Undo2,Volume2,VolumeX,ZoomIn,ZoomOut} from '../../lib/icons';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {executeCommand} from '../../lib/commands';
import {addAudioTrackClip,addImageClip,addTimelineClip,addTimelineClipsFromDialog,cancelVideoExport,deleteAudioTrackClip,deleteTimelineClip,duplicateAudioTrackClip,getFilmstrip,moveAudioTrackClip,moveTimelineClip,openVideo,redoVideoEdit,resizeAudioTrackClip,saveVideoProject,selectAudioTrackClip,selectTimelineClip,splitTimelineAt,toggleTimelineClipMute,trimTimelineClip,undoVideoEdit,useVideoSession,videoCanRedo,videoCanUndo,videoIsDirty,videoIsEdited} from '../../lib/video/session';
import {clipDisplayName,isTitleClip,needsSourceFile} from '../../lib/video/titles';
import {TitlePreview} from './TitlePreview';
import {useTitlePlayback} from './useTitlePlayback';
import {FilmstripStrip} from './FilmstripStrip';
import {WaveformStrip} from './WaveformStrip';
import {blendAt,clipFadeGain,clipRanges,flipOf,isFreeze,isImageClip,locate,rotationOf,speedOf,timelineDuration,type TimelineClip} from '../../lib/video/timeline';
import {shuttleFaster,shuttleSlower} from '../../lib/video/shuttle';
import {audioClipDuration,audioEnvelope,audioTrackEnd,duckGainAt} from '../../lib/video/audioTrack';
import {AudioLane} from './AudioLane';
import {snapPointsFor,zoomInStep,zoomOutStep} from '../../lib/video/zoom';
import {formatTime} from '../../lib/video/recipe';
import {formatBytes,getState,patchState,requestStudio,useAppStore,useMedia,type MediaItem} from './workspace-deps';
import {VideoTimeline} from './VideoTimeline';
import {VideoControls} from './VideoInspector';
import {NativeInput} from '../ui/native-controls';
const bar='media-bar flex items-center gap-2 border-b border-subtle px-3 py-1.5 text-[12px]';
/** Player, transport and the multi-clip timeline of one video project. `withPanel` adds the settings when the Video inspector is not on screen. */
export function VideoWorkspace({item,withPanel=false}:{item:MediaItem;withPanel?:boolean}){
 const {t}=useT();const studio=useAppStore().activeStudio;const session=useVideoSession(item.name);
 const media=useMedia();
 // Two slots, one per clip parity: consecutive clips always land in different elements, so a crossfade can play both at once.
 const slotA=useRef<HTMLVideoElement>(null),slotB=useRef<HTMLVideoElement>(null);
 const [playhead,setPlayhead]=useState(0),[playing,setPlaying]=useState(false),[muted,setMuted]=useState(false),[volume,setVolume]=useState(1);
 const [loop,setLoop]=useState(false),[rateMul,setRateMul]=useState(1);
 const [playable,setPlayable]=useState(true);
 const [zoom,setZoom]=useState(1);
 const note=session?.exportOutcome?t(session.exportOutcome==='downloaded'?'video.downloaded':'video.review.'+session.exportOutcome):'';
 const playingRef=useRef(false);
 useEffect(()=>{void openVideo(item);},[item]);
 useEffect(()=>{setZoom(1);},[item.name]);
 // Opening a video takes you to the Video Studio unless you picked a studio yourself.
 // The Video rail offers Files only, so do not leave the HTML Layers tree open beside video.
 useEffect(()=>{if(studio==='video'&&!['files','search'].includes(getState().leftTab))patchState({leftTab:'files'});},[studio]);
 const clips=session?.clips??[];
 const audioClips=session?.audioClips??[];
 const duration=timelineDuration(clips);
 // The track maps onto the longer of video and audio so an audio tail stays visible and reachable.
 const domain=Math.max(duration,audioTrackEnd(audioClips));
 const ranges=clipRanges(clips);
 const probe=session?.probe??null;
 const fps=probe?.video?.fps&&probe.video.fps>1?probe.video.fps:30;
 const entry=clips.length?locate(clips,playhead):null;
 const blend=blendAt(clips,playhead);
 const main=blend.length?blend[blend.length-1]:null;
 const slotOf=(index:number)=>index%2===0?slotA:slotB;
 // Sources of clips that lost their media tab render as missing and block the export with a clear message.
 const missing=new Set(clips.filter(needsSourceFile).map(c=>c.source).filter((n:string)=>!media.items.some((i:MediaItem)=>i.name===n)));
 const urlOf=(source:string)=>media.items.find((i:MediaItem)=>i.name===source)?.url??item.url;
 const seek=useCallback((s:number)=>{setPlayhead(Math.min(Math.max(0,s),domain||s));},[domain]);
 // Audio-track preview: one hidden element per audio clip. Envelope gain (fades) follows the playhead; drift over 350 ms is re-synced, same as the video slots.
 const audioEls=useRef(new Map<string,HTMLAudioElement>());
 useEffect(()=>{
  for(const ac of audioClips){
   const el=audioEls.current.get(ac.id);if(!el)continue;
   const dur=audioClipDuration(ac),active=playhead>=ac.at&&playhead<ac.at+dur;
   if(playing&&active&&!ac.muted){
    const url=media.items.find((i:MediaItem)=>i.name===ac.source)?.url;
    if(!url){el.pause();continue;}
    if(el.dataset.clipSource!==ac.source){el.dataset.clipSource=ac.source;if(el.src!==url)el.src=url;}
    const expected=ac.in_s+(playhead-ac.at);
    if(el.paused){el.currentTime=expected;void el.play().catch(()=>{});}
    else if(Math.abs(el.currentTime-expected)>0.35)el.currentTime=expected;
    el.muted=muted;
    el.volume=Math.min(1,Math.max(0,volume*audioEnvelope(ac,playhead-ac.at)*duckGainAt(audioClips,ac,playhead)));
   }else if(!el.paused)el.pause();
  }
 },[audioClips,playhead,playing,volume,muted,media]);
 useEffect(()=>{const els=audioEls.current;return()=>els.forEach(el=>el.pause());},[]);
 // Preview transform matching the export: quarter turns shrink the slot to keep the contain fit (the export fits the
 // swapped box instead), mirroring applies inside the rotated frame. Uniform scale commutes with the rotate.
 const previewTransform=(clip:TimelineClip,w:number,h:number):string=>{
  const f=flipOf(clip),r=rotationOf(clip);
  if(f==='none'&&r===0)return'';
  const parts:string[]=[];
  if(r!==0){const sFit=r===180?1:(w>0&&h>0?Math.min(w/h,h/w):1);parts.push(`rotate(${r}deg)`,`scale(${sFit})`);}
  if(f!=='none')parts.push(`scale(${f.includes('h')?-1:1},${f.includes('v')?-1:1})`);
  return parts.join(' ');
 };
 // Every active slot sits on its clip's source and frame. A paused transport (seek, frame step) always syncs the
 // frame; while playing, only drift over 350 ms is corrected so the element's own clock does the smooth work.
 useEffect(()=>{
  for(const e of blend){
   if(isTitleClip(e.range.clip)||isImageClip(e.range.clip))continue;
   const el=slotOf(e.range.index).current;if(!el)continue;
   const url=urlOf(e.range.clip.source);
   if(el.dataset.slotClip!==e.range.clip.id){el.dataset.slotClip=e.range.clip.id;if(el.src!==url){el.src=url;el.currentTime=e.sourceTime;}}
   {const t=previewTransform(e.range.clip,el.clientWidth,el.clientHeight);if(el.style.transform!==t)el.style.transform=t;}
   // Speed applies in the preview too; preservesPitch off so the preview sounds like the export (resampled, shifted pitch).
   el.playbackRate=speedOf(e.range.clip)*rateMul;el.preservesPitch=false;
   if(!playing||Math.abs(el.currentTime-e.sourceTime)>0.35)el.currentTime=e.sourceTime;
  }
  for(const e of blend){
   if(!isImageClip(e.range.clip))continue;
   const el=stageRef.current?.querySelector<HTMLImageElement>(`img[data-img-clip="${e.range.clip.id}"]`);if(!el)continue;
   const t=previewTransform(e.range.clip,el.clientWidth,el.clientHeight);if(el.style.transform!==t)el.style.transform=t;
  }
  for(const slot of [slotA,slotB]){
   const el=slot.current;
   if(el&&!blend.some(e=>slotOf(e.range.index)===slot))el.pause();
  }
 },[blend,media,playing,rateMul]);
 // Play/pause follows the transport for every slot that is part of the current blend.
 useEffect(()=>{
  for(const e of blend){
   if(isTitleClip(e.range.clip)||isImageClip(e.range.clip)||isFreeze(e.range.clip))continue;
   const el=slotOf(e.range.index).current;if(!el)continue;
   if(playing){if(el.paused)void el.play().catch(()=>{});}else el.pause();
  }
 },[blend,playing]);
 // Preview volume matches the export chain: workspace volume x crossfade weight x clip gain/mute x the clip's own audio fades.
 useEffect(()=>{
  for(const e of blend){
   if(isTitleClip(e.range.clip)||isImageClip(e.range.clip))continue;
   const el=slotOf(e.range.index).current;if(!el)continue;
   const c=e.range.clip;
   el.muted=muted;el.volume=isFreeze(c)?0:Math.min(1,Math.max(0,volume*e.audio*(c.muted?0:c.gain)*clipFadeGain(c,e.range.start,e.range.end,playhead)));
  }
 },[blend,volume,muted,playhead]);
 const advance=useCallback((fromIndex:number)=>{
  const next=ranges[fromIndex+1];
  if(next){setPlayhead(next.start+0.001);}
  else if(loop){setPlayhead(0);}
  else{playingRef.current=false;setPlaying(false);setPlayhead(duration);}
 },[ranges,duration,loop]);
 const pauseAll=useCallback(()=>{playingRef.current=false;setPlaying(false);slotA.current?.pause();slotB.current?.pause();},[]);
 const toggle=useCallback(()=>{
  if(playing){pauseAll();return;}
  if(playhead>=duration-0.02)setPlayhead(0);
  playingRef.current=true;setPlaying(true);
 },[playing,playhead,duration,pauseAll]);
 const step=(dir:1|-1)=>{pauseAll();seek(playhead+dir/fps);};
 const mainEl=()=>main?slotOf(main.range.index).current:null;
 // The element clock is fresher than the React playhead (timeupdate lags a frame), so cuts land where the frame actually is.
 const splitHere=useCallback(()=>{
  const el=mainEl();
  splitTimelineAt(item.name,el&&entry&&!isFreeze(entry.range.clip)?entry.range.start+(el.currentTime-entry.range.clip.in_s)/speedOf(entry.range.clip):playhead);
 },[item.name,playhead,entry,main]);
 // The main slot drives the playhead and the boundary advance; the outgoing slot only stops at its own out point.
 const onTime=(slotIndex:number)=>(e:React.SyntheticEvent<HTMLVideoElement>)=>{
  const el=e.currentTarget;
  const mine=blend.find(x=>(x.range.index%2)===slotIndex);if(!mine)return;
  const c=mine.range.clip;
  if(main&&mine.range.index===main.range.index){
   setPlayhead(Math.min(duration,mine.range.start+(el.currentTime-c.in_s)/speedOf(c)));
   if(el.currentTime>=c.out_s-0.001)advance(mine.range.index);
  }else if(el.currentTime>=c.out_s-0.001)el.pause();
 };
 const onKey=(e:React.KeyboardEvent)=>{
  const skip=e.shiftKey?5:1;
  const selected=session?.selectedClipId??null;
  const mod=e.ctrlKey||e.metaKey;
  if(mod&&(e.key==='z'||e.key==='Z')){e.preventDefault();(e.shiftKey?redoVideoEdit:undoVideoEdit)(item.name);return;}
  if(mod&&(e.key==='y'||e.key==='Y')){e.preventDefault();redoVideoEdit(item.name);return;}
  if(mod&&(e.key==='s'||e.key==='S')){e.preventDefault();saveVideoProject(item.name);return;}
  if(e.key===' '){e.preventDefault();toggle();}
  else if(e.key==='k'||e.key==='K'){e.preventDefault();toggle();}
  else if(e.key==='l'||e.key==='L'){e.preventDefault();if(playing)setRateMul(r=>shuttleFaster({rate:r,playing:true}).rate);else{setRateMul(1);toggle();}}
  else if(e.key==='j'||e.key==='J'){e.preventDefault();if(playing){const n=shuttleSlower({rate:rateMul,playing:true});setRateMul(n.rate);if(!n.playing)pauseAll();}else step(-1);}
  else if(e.key==='ArrowRight'&&!e.altKey){e.preventDefault();seek(playhead+skip);}
  else if(e.key==='ArrowLeft'&&!e.altKey){e.preventDefault();seek(playhead-skip);}
  else if(e.key==='i'||e.key==='o'){e.preventDefault();const el=mainEl();if(entry)trimTimelineClip(item.name,entry.range.clip.id,e.key==='i'?'in':'out',el?el.currentTime:entry.sourceTime,`trim:${entry.range.clip.id}:${e.key==='i'?'in':'out'}`);}
  else if(e.key==='s'||e.key==='S'){e.preventDefault();splitHere();}
  else if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();deleteTimelineClip(item.name,selected);}
  else if((e.key==='Delete'||e.key==='Backspace')&&session?.selectedAudioClipId){e.preventDefault();deleteAudioTrackClip(item.name,session.selectedAudioClipId);}
  else if(e.key==='ArrowRight'&&e.altKey&&selected){e.preventDefault();moveTimelineClip(item.name,selected,1);}
  else if(e.key==='ArrowLeft'&&e.altKey&&selected){e.preventDefault();moveTimelineClip(item.name,selected,-1);}
  else if(e.key==='m'||e.key==='M'){e.preventDefault();const id=selected??entry?.range.clip.id;if(id)toggleTimelineClipMute(item.name,id);}
  else if(e.key==='Home'){e.preventDefault();seek(0);}
  else if(e.key==='+'||e.key==='='){e.preventDefault();setZoom(z=>zoomInStep(z));}
  else if(e.key==='-'){e.preventDefault();setZoom(z=>zoomOutStep(z));}
  else if(e.key==='End'){e.preventDefault();seek(duration);}
 };
 // Title cards and image clips have no <video>; this rAF clock plays through them and advances at the clip end.
 const stillMain=main&&(isTitleClip(main.range.clip)||isImageClip(main.range.clip)||isFreeze(main.range.clip))?main:null;
 useTitlePlayback({running:playing&&!!stillMain,from:playhead,limit:stillMain?.range.end??0,rate:rateMul,onTime:setPlayhead,onEnd:()=>{if(stillMain)advance(stillMain.range.index);}});
 const filmstrip=getFilmstrip();
 const stageRef=useRef<HTMLDivElement|null>(null);
 const shortName=(n:string)=>n.replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'');
 const status=session?.status==='loading'?t('video.loading'):session?.status==='error'?t('video.error',{message:session.error}):'';
 const v=probe?.video;
 const edited=videoIsEdited(session);
 const exporting=session?.status==='exporting';
 const selectedClip=clips.find(c=>c.id===session?.selectedClipId)??null;
 return <section className="canvas-stage flex min-h-0 w-full flex-1 flex-col" aria-label={t('video.title')} data-testid="video-workspace" tabIndex={-1} onKeyDown={onKey}>
  <div className={bar}>
   <span className="truncate font-medium text-ink" data-testid="video-name">{item.name}{videoIsDirty(session??null)&&<span className="text-ink-3" title={t('video.unsaved')}> ●</span>}</span>
   <span className="text-ink-3" data-testid="video-info">{v?t('video.info',{duration:(probe?.duration??0).toFixed(2),width:v.width,height:v.height,codec:v.codec??'?'})+(v.fps?` · ${t('video.infoFps',{fps:v.fps})}`:''):''}</span>
   {clips.length>1&&<span className="text-ink-3" data-testid="video-clip-count">{t('video.clipCount',{count:clips.length})}</span>}
   <span className="flex-1"/>
   <Button size="compact" aria-label={t('video.export')} title={t('video.exportHint')} disabled={!session||session.status!=='ready'||!clips.length||missing.size>0} onClick={()=>void executeCommand('video.export.open')} data-testid="video-export"><Download size={13}/>{t('video.export')}</Button>
  </div>
  <div className="flex min-h-0 w-full flex-1">
   <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center bg-black/90" data-testid="video-stage">
     {!clips.length?<div className="grid justify-items-center gap-3 text-center text-[13px] text-white" data-testid="video-empty-timeline"><p>Your timeline is empty. Add clips to start editing.</p><Button variant="outline" onClick={()=>void addTimelineClipsFromDialog(item.name)}>Add video clips</Button></div>:playable&&blend.some(e=>needsSourceFile(e.range.clip)||isImageClip(e.range.clip))?[slotA,slotB].map((slot,idx)=>{
      const e=blend.find(x=>!isTitleClip(x.range.clip)&&!isImageClip(x.range.clip)&&(x.range.index%2)===idx);
      return <video key={idx} ref={slot} className="absolute inset-0 h-full w-full object-contain p-2" preload="auto"
       style={{opacity:e?(main&&e.range.index===main.range.index?e.video:1):0,visibility:e?'visible':'hidden',zIndex:e&&main&&e.range.index===main.range.index?1:0,pointerEvents:'none'}}
       onTimeUpdate={onTime(idx)} onEnded={onTime(idx)} onError={()=>setPlayable(false)}
       data-testid={idx===0?'video-player':'video-player-b'} data-clip-id={e?.range.clip.id}/>;
     }):<p className="max-w-[420px] p-4 text-center text-[13px] text-ink-2" data-testid="video-nopreview">{t('video.noPreview',{ext:session?.ext??item.name.split('.').pop()??''})}</p>}
     {playable&&blend.map(e=>isTitleClip(e.range.clip)?<div key={e.range.clip.id} className="absolute inset-0 flex items-center justify-center p-2" style={{opacity:main&&e.range.index===main.range.index?e.video:1,zIndex:main&&e.range.index===main.range.index?1:0,pointerEvents:'none'}}>
      <TitlePreview clip={e.range.clip} time={e.sourceTime} aspect={(probe?.video?.width??16)/(probe?.video?.height??9)} label={clipDisplayName(e.range.clip,'Title')}/>
     </div>:null)}
     {playable&&blend.map(e=>isImageClip(e.range.clip)?<img key={e.range.clip.id} src={urlOf(e.range.clip.source)} alt="" className="absolute inset-0 h-full w-full object-contain p-2" style={{opacity:main&&e.range.index===main.range.index?e.video:1,zIndex:main&&e.range.index===main.range.index?1:0,pointerEvents:'none'}} data-testid="video-image-preview" data-img-clip={e.range.clip.id}/>:null)}
    </div>
    <div className="flex items-center gap-3 px-4 pt-2 text-[12px] text-ink-2">
     <Button size="icon" variant="outline" aria-label={t(playing?'video.pause':'video.play')} aria-pressed={playing} disabled={!playable||!clips.length} onClick={toggle} data-testid="video-play">{playing?<Pause size={16}/>:<Play size={16}/>}</Button>
     <Button size="icon" variant="ghost" aria-label={t('video.frameBack')} disabled={!playable||!clips.length} onClick={()=>step(-1)} data-testid="video-frame-back"><ChevronsLeft size={16}/></Button>
     <Button size="icon" variant="ghost" aria-label={t('video.frameFwd')} disabled={!playable||!clips.length} onClick={()=>step(1)} data-testid="video-frame-fwd"><ChevronsRight size={16}/></Button>
     <span className="tabular-nums" data-testid="video-time">{formatTime(playhead)} / {formatTime(duration)}</span>
     <Button size="icon" variant="ghost" aria-label={t('video.split')} title={t('video.splitHint')} disabled={!entry||exporting} onClick={splitHere} data-testid="video-split"><Scissors size={16}/></Button>
     <Button size="icon" variant="ghost" aria-label={t('video.undo')} title={t('video.undoHint')} disabled={!videoCanUndo(session??null)} onClick={()=>undoVideoEdit(item.name)} data-testid="video-undo"><Undo2 size={16}/></Button>
     <Button size="icon" variant="ghost" aria-label={t('video.redo')} title={t('video.redoHint')} disabled={!videoCanRedo(session??null)} onClick={()=>redoVideoEdit(item.name)} data-testid="video-redo"><Redo2 size={16}/></Button>
     {selectedClip&&<span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] text-ink" data-testid="video-selected-chip">{t('video.selectedClip',{name:clipDisplayName(selectedClip,selectedClip.source.replace(/^.*[\\/]/,'')),length:(selectedClip.out_s-selectedClip.in_s).toFixed(2)})}</span>}
     <span className="flex-1"/>
     <Button size="icon" variant="ghost" aria-label={t(muted?'video.unmute':'video.mute')} aria-pressed={muted} onClick={()=>setMuted(m=>!m)} data-testid="video-mute">{muted?<VolumeX size={16}/>:<Volume2 size={16}/>}</Button>
     <NativeInput type="range" className="w-20 accent-[var(--accent)]" min={0} max={1} step={0.05} value={volume} aria-label={t('video.volume')} onChange={e=>{const n=Number(e.target.value);setVolume(n);}} data-testid="video-volume"/>
     <Button size="icon" variant="ghost" aria-label={t('video.loop')} aria-pressed={loop} title={t('video.loopHint')} onClick={()=>setLoop(v=>!v)} data-testid="video-loop"><RotateCcw size={16}/></Button>
     <span className="mx-1 h-4 w-px bg-subtle" aria-hidden="true"/>
     <Button size="icon" variant="ghost" aria-label={t('video.zoomOut')} disabled={zoom<=1} onClick={()=>setZoom(z=>zoomOutStep(z))} data-testid="video-zoom-out"><ZoomOut size={15}/></Button>
     <NativeInput type="range" className="w-20 accent-[var(--accent)]" min={1} max={20} step={0.5} value={zoom} aria-label={t('video.zoom')} aria-valuetext={t('video.zoomValue',{zoom:zoom.toFixed(1)})} onChange={e=>setZoom(Math.min(20,Math.max(1,Number(e.target.value))))} data-testid="video-zoom"/>
     <Button size="icon" variant="ghost" aria-label={t('video.zoomIn')} disabled={zoom>=20} onClick={()=>setZoom(z=>zoomInStep(z))} data-testid="video-zoom-in"><ZoomIn size={15}/></Button>
    </div>
    <div className="px-4 pb-2 pt-1">
     <VideoTimeline clips={clips} selectedId={session?.selectedClipId??null} position={playhead} missing={missing}
      onSeek={seek} onSelect={id=>selectTimelineClip(item.name,id)}
      onTrim={(id,edge,at)=>trimTimelineClip(item.name,id,edge,at,`trim:${id}:${edge}`)}
      onMove={(id,by)=>moveTimelineClip(item.name,id,by)}
      trackHeight={48} zoom={zoom} onZoom={setZoom} domain={domain}
      audioLane={<AudioLane clips={audioClips} selectedId={session?.selectedAudioClipId??null} duration={domain} controller={filmstrip}
       onSelect={id=>selectAudioTrackClip(item.name,id)}
       onMoveAt={(id,at)=>moveAudioTrackClip(item.name,id,at,`amove:${id}`)}
       onResize={(id,edge,t2)=>resizeAudioTrackClip(item.name,id,edge,t2,`atrim:${id}:${edge}`)}
       onDuplicate={id=>duplicateAudioTrackClip(item.name,id)}
       snapPoints={[...snapPointsFor(clips,[playhead]),domain,...audioClips.flatMap(ac=>[ac.at,ac.at+audioClipDuration(ac)])]}
       onDropAudio={(n,t2)=>{const dropped=media.items.find((i:MediaItem)=>i.name===n&&i.kind==='audio');if(dropped)void addAudioTrackClip(item.name,dropped,t2).then(id=>{if(id)selectAudioTrackClip(item.name,id);});}}
       label={t('video.audioLane')}/>}
      onDropMedia={(n,t2)=>{const dropped=media.items.find((i:MediaItem)=>i.name===n);
       if(dropped?.kind==='video')void addTimelineClip(item.name,dropped,t2);
       else if(dropped?.kind==='image')addImageClip(item.name,dropped,undefined,t2);}}
      renderStrip={c=>needsSourceFile(c)&&!isImageClip(c)&&filmstrip?<>
       <FilmstripStrip controller={filmstrip} source={c.source} in_s={c.in_s} out_s={c.out_s} name={shortName(c.source)}/>
       <WaveformStrip controller={filmstrip} source={c.source} in_s={c.in_s} out_s={c.out_s} gain={c.muted?0:c.gain}/>
      </>:null}
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
  {audioClips.map(ac=><audio key={ac.id} ref={el=>{if(el)audioEls.current.set(ac.id,el);else audioEls.current.delete(ac.id);}} preload="auto" className="hidden" data-testid="audio-preview" data-clip-id={ac.id}/>)}
  {probe?.audio&&<span className="hidden" data-testid="video-audio-info">{t('video.audioInfo',{codec:probe.audio.codec??'?',channels:probe.audio.channels===1?t('video.mono'):probe.audio.channels===2?t('video.stereo'):t('video.channelsN',{count:probe.audio.channels}),rate:probe.audio.rate})}</span>}
  {probe&&!probe.audio&&<span className="hidden" data-testid="video-audio-info">{t('video.noAudio')}</span>}
 </section>;
}
