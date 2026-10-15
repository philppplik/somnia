import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react';
import {ChevronsLeft,ChevronsRight,Mic,Download,Pause,Play,Redo2,RotateCcw,Scissors,Undo2,Volume2,VolumeX,ZoomIn,ZoomOut} from '../../lib/icons';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {executeCommand} from '../../lib/commands';
import {addAudioTrackClip,addImageClip,addTimelineClip,addTimelineClipsFromDialog,cancelVideoExport,deleteAudioTrackClip,deleteTimelineClip,duplicateAudioTrackClip,getFilmstrip,moveAudioTrackClip,moveOverlayClip,moveTimelineClip,openVideo,redoVideoEdit,resizeAudioTrackClip,saveVideoProject,selectAudioTrackClip,selectOverlayClip,setOverlayDuration,setOverlayRect,setOverlayRectKey,selectTimelineClip,splitTimelineAt,toggleTimelineClipMute,trimTimelineClip,undoVideoEdit,setVideoPlayhead,useVideoPlayhead,useVideoSession,videoCanRedo,videoCanUndo,videoIsDirty,videoIsEdited} from '../../lib/video/session';
import {clipDisplayName,DEFAULT_TITLE,isTitleClip,needsSourceFile} from '../../lib/video/titles';
import {TitlePreview} from './TitlePreview';
import {useTitlePlayback} from './useTitlePlayback';
import {FilmstripStrip} from './FilmstripStrip';
import {WaveformStrip} from './WaveformStrip';
import {blendAt,clipFadeGain,clipRanges,cropOf,flipOf,isFreeze,isImageClip,locate,rotationOf,speedOf,timelineDuration,transitionOf,transitionVisual,isReversed,type BlendEntry,type TimelineClip,type TransitionVisual} from '../../lib/video/timeline';
import {shuttleFaster,shuttleSlower} from '../../lib/video/shuttle';
import {audioClipDuration,audioEnvelope,audioTrackEnd,duckGainAt} from '../../lib/video/audioTrack';
import {AudioLane} from './AudioLane';
import {OverlayLane} from './OverlayLane';
import {snapPointsFor,zoomInStep,zoomOutStep} from '../../lib/video/zoom';
import {formatTime} from '../../lib/video/recipe';
import {pickVoiceoverMime,voiceoverExtension,voiceoverFileName} from '../../lib/video/voiceover';
import {overlayOpacityAt,overlayRectAt,overlaysAt,overlayTrackEnd,type OverlayClip,type OverlayRect} from '../../lib/video/overlayTrack';
import {addMediaFile,getMedia} from '../../lib/media';
import {formatBytes,getState,patchState,requestStudio,useAppStore,useMedia,type MediaItem} from './workspace-deps';
import {VideoTimeline} from './VideoTimeline';
import {VideoControls} from './VideoInspector';
import {NativeInput} from '../ui/native-controls';
const bar='media-bar flex items-center gap-2 border-b border-subtle px-3 py-1.5 text-[12px]';
/** A video overlay (PiP) on the preview stage: a muted <video> element synced to the playhead offset. Drift over
 * 0.3 s re-seeks; the playback rate follows the JKL shuttle like the main players. */
function PipPreview({o,playhead,playing,rate,url}:{o:OverlayClip;playhead:number;playing:boolean;rate:number;url:string}){
 const ref=useRef<HTMLVideoElement|null>(null);
 useEffect(()=>{
  const v=ref.current;if(!v)return;
  v.playbackRate=rate;v.preservesPitch=false;
  v.muted=o.gain<=0;v.volume=Math.min(1,o.gain);
  const target=o.in_s+Math.max(0,playhead-o.at);
  if(Math.abs(v.currentTime-target)>0.3)v.currentTime=target;
  if(playing)void v.play().catch(()=>{});else v.pause();
 },[o.in_s,o.at,o.gain,playhead,playing,rate]);
 return <video ref={ref} src={url} playsInline className="h-full w-full object-contain" data-testid="video-pip-preview"/>;
}

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
 const overlayClips=session?.overlayClips??[];
 const duration=timelineDuration(clips);
 // The track maps onto the longer of video and audio so an audio tail stays visible and reachable.
 const domain=Math.max(duration,audioTrackEnd(audioClips),overlayTrackEnd(overlayClips));
 const timelineSnapPoints=[...snapPointsFor(clips,[playhead]),domain,...audioClips.flatMap(ac=>[ac.at,ac.at+audioClipDuration(ac)]),...overlayClips.flatMap(oc=>[oc.at,oc.at+oc.duration])];
 const ranges=clipRanges(clips);
 const probe=session?.probe??null;
 const fps=probe?.video?.fps&&probe.video.fps>1?probe.video.fps:30;
 const entry=clips.length?locate(clips,playhead):null;
 const blend=blendAt(clips,playhead);
 const main=blend.length?blend[blend.length-1]:null;
 // Wipe/slide transition: during a crossfade the incoming clip is revealed by clip-path or offset instead of alpha.
 const transition=blend.length===2&&main?transitionOf(blend[0].range.clip):'dissolve';
 const transVisual=(e:BlendEntry):TransitionVisual|undefined=>main&&blend.length===2&&e.range.index===main.range.index&&transition!=='dissolve'?transitionVisual(transition,e.video,1,1):undefined;
 // Title cards carry no element transform, so their transition is a plain CSS inset/translate (percent = stage box).
 const transCss=(e:BlendEntry):CSSProperties|undefined=>{
  const v=transVisual(e);if(!v)return undefined;
  if(v.kind==='wipe'&&v.rect)return{clipPath:`inset(${v.rect.y*100}% ${(1-v.rect.x-v.rect.w)*100}% ${(1-v.rect.y-v.rect.h)*100}% ${v.rect.x*100}%)`};
  if(v.kind==='slide')return{transform:`translate(${v.dx*100}%,${v.dy*100}%)`};
  return undefined;
 };
 const slotOf=(index:number)=>index%2===0?slotA:slotB;
 // Sources of clips that lost their media tab render as missing and block the export with a clear message.
 const missing=new Set(clips.filter(needsSourceFile).map(c=>c.source).filter((n:string)=>!media.items.some((i:MediaItem)=>i.name===n)));
 const urlOf=(source:string)=>media.items.find((i:MediaItem)=>i.name===source)?.url??item.url;
 const seek=useCallback((s:number)=>{setPlayhead(Math.min(Math.max(0,s),domain||s));},[domain]);
 useEffect(()=>{setVideoPlayhead(playhead);},[playhead]);
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
 // swapped box instead), mirroring applies inside the rotated frame. Uniform scale commutes with the rotate. A crop
 // zooms the remaining region back into the frame (outermost translate+scale, screen space) and clips the overflow
 // with an inverse-mapped polygon, so the preview shows the same contain-fitted region the export renders.
 // A wipe/slide transition on the incoming clip composes here: slide is an outermost screen-space translate,
 // wipe is a clip polygon - inverse-mapped like the crop when the clip itself is rotated/mirrored.
 const applyPreviewTransform=(el:HTMLElement,clip:TimelineClip,trans?:TransitionVisual)=>{
  const f=flipOf(clip),r=rotationOf(clip),w=el.clientWidth,h=el.clientHeight;
  const cr=cropOf(clip),cropped=cr.left>0||cr.top>0||cr.right>0||cr.bottom>0;
  const dx=(trans?.dx??0)*w,dy=(trans?.dy??0)*h;
  const wipe=trans?.rect?{x0:trans.rect.x*w,y0:trans.rect.y*h,x1:(trans.rect.x+trans.rect.w)*w,y1:(trans.rect.y+trans.rect.h)*h}:null;
  if(!cropped&&!(wipe&&(r!==0||f!=='none'))){
   const parts:string[]=[];
   if(dx||dy)parts.push(`translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`);
   if(r!==0){const sFit=r===180?1:(w>0&&h>0?Math.min(w/h,h/w):1);parts.push(`rotate(${r}deg)`,`scale(${sFit})`);}
   if(f!=='none')parts.push(`scale(${f.includes('h')?-1:1},${f.includes('v')?-1:1})`);
   const t=parts.join(' ');
   if(el.style.transformOrigin)el.style.transformOrigin='';
   if(el.style.transform!==t)el.style.transform=t;
   const cp=wipe?`inset(${wipe.y0.toFixed(1)}px ${(w-wipe.x1).toFixed(1)}px ${(h-wipe.y1).toFixed(1)}px ${wipe.x0.toFixed(1)}px)`:'';
   if(el.style.clipPath!==cp)el.style.clipPath=cp;
   return;
  }
  if(w<=0||h<=0)return;
  el.style.transformOrigin='0 0';
  const rw=(1-cr.left-cr.right)*w,rh=(1-cr.top-cr.bottom)*h,zs=Math.min(w/rw,h/rh);
  const tx=(w-zs*rw)/2-zs*cr.left*w,ty=(h-zs*rh)/2-zs*cr.top*h;
  const centered=r!==0||f!=='none',sf=r===90||r===270?Math.min(w/h,h/w):1,cx=w/2,cy=h/2;
  const parts:string[]=[`translate(${tx}px,${ty}px)`,`scale(${zs})`];
  if(dx||dy)parts.unshift(`translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`);
  if(centered){
   parts.push(`translate(${cx}px,${cy}px)`);
   if(r!==0)parts.push(`rotate(${r}deg)`,`scale(${sf})`);
   if(f!=='none')parts.push(`scale(${f.includes('h')?-1:1},${f.includes('v')?-1:1})`);
   parts.push(`translate(${-cx}px,${-cy}px)`);
  }
  const t=parts.join(' ');
  if(el.style.transform!==t)el.style.transform=t;
  // Clip the frame box mapped back through the whole chain (keeps zoom overflow out of the letterbox bars).
  const rad=-r*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad),fh=f.includes('h')?-1:1,fv=f.includes('v')?-1:1;
  const inv=(qx:number,qy:number):string=>{
   let x=(qx-dx-tx)/zs,y=(qy-dy-ty)/zs;
   if(centered){x-=cx;y-=cy;if(r!==0){const x2=x*cos-y*sin,y2=x*sin+y*cos;x=x2/sf;y=y2/sf;}if(f!=='none'){x*=fh;y*=fv;}x+=cx;y+=cy;}
   return`${x.toFixed(2)}px ${y.toFixed(2)}px`;
  };
  const cp=wipe?`polygon(${inv(wipe.x0,wipe.y0)},${inv(wipe.x1,wipe.y0)},${inv(wipe.x1,wipe.y1)},${inv(wipe.x0,wipe.y1)})`:`polygon(${inv(0,0)},${inv(w,0)},${inv(w,h)},${inv(0,h)})`;
  if(el.style.clipPath!==cp)el.style.clipPath=cp;
 };
 // Every active slot sits on its clip's source and frame. A paused transport (seek, frame step) always syncs the
 // frame; while playing, only drift over 350 ms is corrected so the element's own clock does the smooth work.
 useEffect(()=>{
  for(const e of blend){
   if(isTitleClip(e.range.clip)||isImageClip(e.range.clip))continue;
   const el=slotOf(e.range.index).current;if(!el)continue;
   const url=urlOf(e.range.clip.source);
   if(el.dataset.slotClip!==e.range.clip.id){el.dataset.slotClip=e.range.clip.id;if(el.src!==url){el.src=url;el.currentTime=e.sourceTime;}}
   applyPreviewTransform(el,e.range.clip,transVisual(e));
   // Speed applies in the preview too; preservesPitch off so the preview sounds like the export (resampled, shifted pitch).
   el.playbackRate=speedOf(e.range.clip)*rateMul;el.preservesPitch=false;
   if(isReversed(e.range.clip)){if(!el.paused)el.pause();el.currentTime=e.sourceTime;}
   else if(!playing||Math.abs(el.currentTime-e.sourceTime)>0.35)el.currentTime=e.sourceTime;
  }
  for(const e of blend){
   if(!isImageClip(e.range.clip))continue;
   const el=stageRef.current?.querySelector<HTMLImageElement>(`img[data-img-clip="${e.range.clip.id}"]`);if(!el)continue;
   applyPreviewTransform(el,e.range.clip,transVisual(e));
  }
  for(const slot of [slotA,slotB]){
   const el=slot.current;
   if(el&&!blend.some(e=>slotOf(e.range.index)===slot))el.pause();
  }
 },[blend,media,playing,rateMul]);
 // Play/pause follows the transport for every slot that is part of the current blend.
 useEffect(()=>{
  for(const e of blend){
   if(isTitleClip(e.range.clip)||isImageClip(e.range.clip)||isFreeze(e.range.clip)||isReversed(e.range.clip))continue;
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
   el.muted=muted;el.volume=isFreeze(c)||isReversed(c)?0:Math.min(1,Math.max(0,volume*e.audio*(c.muted?0:c.gain)*clipFadeGain(c,e.range.start,e.range.end,playhead)));
  }
 },[blend,volume,muted,playhead]);
 const advance=useCallback((fromIndex:number)=>{
  const next=ranges[fromIndex+1];
  if(next){setPlayhead(next.start+0.001);}
  else if(loop){setPlayhead(0);}
  else{playingRef.current=false;setPlaying(false);setPlayhead(duration);}
 },[ranges,duration,loop]);
 // Reversed clips never play their element (the export walks the source backwards); a 100 ms timer steps the
 // playhead instead, and the sync effect seeks the paused element to each reversed frame.
 useEffect(()=>{
  if(!playing)return;
  const e=blend[blend.length-1];
  if(!e||!isReversed(e.range.clip))return;
  const iv=setInterval(()=>{
   if(playhead+0.1>=e.range.end)advance(e.range.index);
   else setPlayhead(playhead+0.1);
  },100);
  return()=>clearInterval(iv);
 },[playing,blend,playhead,advance]);
 const pauseAll=useCallback(()=>{playingRef.current=false;setPlaying(false);slotA.current?.pause();slotB.current?.pause();},[]);
 // Voiceover: records the microphone while the preview plays, then drops the take on the audio track at the
 // playhead position where recording started. The recorder lives in a ref; only the on/off flag is state.
 const [recording,setRecording]=useState(false);
 const [voiceoverError,setVoiceoverError]=useState('');
 const voiceoverRef=useRef<{rec:MediaRecorder;stream:MediaStream;chunks:Blob[];startAt:number;mime:string}|null>(null);
 const stopVoiceover=useCallback(()=>{
  const r=voiceoverRef.current;if(!r)return;
  voiceoverRef.current=null;setRecording(false);
  playingRef.current=false;setPlaying(false);slotA.current?.pause();slotB.current?.pause();
  r.rec.onstop=()=>{
   r.stream.getTracks().forEach(track=>track.stop());
   const ext=voiceoverExtension(r.mime);
   const blob=new Blob(r.chunks,{type:r.mime||'audio/webm'});
   const name=voiceoverFileName(getMedia().items.map(i=>i.name),ext);
   void addMediaFile(blob,name,undefined,{activate:false}).then(res=>{
    if('error' in res){setVoiceoverError(res.error);return;}
    const item=getMedia().items.find(i=>i.name===res.name);
    if(item)void addAudioTrackClip(item.name,item,r.startAt);
   });
  };
  r.rec.stop();
 },[]);
 const toggleVoiceover=useCallback(()=>{
  if(voiceoverRef.current){stopVoiceover();return;}
  setVoiceoverError('');
  void (async()=>{
   try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const mime=pickVoiceoverMime(type=>MediaRecorder.isTypeSupported(type));
    const rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
    const chunks:Blob[]=[];
    rec.ondataavailable=e=>{if(e.data.size>0)chunks.push(e.data);};
    voiceoverRef.current={rec,stream,chunks,startAt:playhead,mime:rec.mimeType||mime};
    rec.start(250);
    setRecording(true);
    playingRef.current=true;setPlaying(true);
   }catch{
    setVoiceoverError(t('video.voiceoverMicError'));
   }
  })();
 },[playhead,stopVoiceover,t]);
 // A closing workspace must not leave the microphone open.
 useEffect(()=>()=>{const r=voiceoverRef.current;if(r){voiceoverRef.current=null;try{r.rec.stop();}catch{/* already stopped */}r.stream.getTracks().forEach(track=>track.stop());}},[]);

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
       style={{opacity:e?(main&&e.range.index===main.range.index?(transition!=='dissolve'?1:e.video):1):0,visibility:e?'visible':'hidden',zIndex:e&&main&&e.range.index===main.range.index?1:0,pointerEvents:'none'}}
       onTimeUpdate={onTime(idx)} onEnded={onTime(idx)} onError={()=>setPlayable(false)}
       data-testid={idx===0?'video-player':'video-player-b'} data-clip-id={e?.range.clip.id}/>;
     }):<p className="max-w-[420px] p-4 text-center text-[13px] text-ink-2" data-testid="video-nopreview">{t('video.noPreview',{ext:session?.ext??item.name.split('.').pop()??''})}</p>}
     {playable&&blend.map(e=>isTitleClip(e.range.clip)?<div key={e.range.clip.id} className="absolute inset-0 flex items-center justify-center p-2" style={{opacity:main&&e.range.index===main.range.index?(transition!=='dissolve'?1:e.video):1,zIndex:main&&e.range.index===main.range.index?1:0,pointerEvents:'none',...transCss(e)}}>
      <TitlePreview clip={e.range.clip} time={e.sourceTime} aspect={(probe?.video?.width??16)/(probe?.video?.height??9)} label={clipDisplayName(e.range.clip,'Title')}/>
     </div>:null)}
     {playable&&blend.map(e=>isImageClip(e.range.clip)?<img key={e.range.clip.id} src={urlOf(e.range.clip.source)} alt="" className="absolute inset-0 h-full w-full object-contain p-2" style={{opacity:main&&e.range.index===main.range.index?(transition!=='dissolve'?1:e.video):1,zIndex:main&&e.range.index===main.range.index?1:0,pointerEvents:'none'}} data-testid="video-image-preview" data-img-clip={e.range.clip.id}/>:null)}
     {playable&&overlaysAt(session?.overlayClips??[],playhead).map(o=>{
      const selOverlay=o.id===session?.selectedOverlayClipId;
      // Keyframed overlays draw at the animated rect/opacity; drags write a key at the playhead instead of the static rect.
      const oRect=overlayRectAt(o,playhead),oOpacity=overlayOpacityAt(o,playhead),keyed=!!o.rectKeys?.length;
      const writeRect=(r:OverlayRect,hk:string)=>{if(keyed)setOverlayRectKey(item.name,o.id,Math.max(0,playhead-o.at),r,hk);else setOverlayRect(item.name,o.id,r,hk);};
      const beginDrag=(e:React.PointerEvent)=>{
       e.preventDefault();e.stopPropagation();
       selectOverlayClip(item.name,o.id);
       const base={x:oRect.x,y:oRect.y},sx=e.clientX,sy=e.clientY;
       const move=(ev:PointerEvent)=>{
        const box=stageRef.current?.getBoundingClientRect();
        if(!box||box.width===0||box.height===0)return;
        writeRect({...oRect,x:base.x+(ev.clientX-sx)/box.width,y:base.y+(ev.clientY-sy)/box.height},`orect-drag:${o.id}`);
       };
       const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
       window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
      };
      // Eight handles: corners move two edges, edge handles move one. Shift on a corner keeps the pixel aspect
      // ratio (computed in stage pixels, since the stage is not necessarily square in fraction space).
      const beginResize=(edges:{l?:boolean;r?:boolean;t?:boolean;bb?:boolean})=>(e:React.PointerEvent)=>{
       e.preventDefault();e.stopPropagation();
       const base={...oRect},sx=e.clientX,sy=e.clientY,corner=(edges.l||edges.r)&&(edges.t||edges.bb);
       const move=(ev:PointerEvent)=>{
        const box=stageRef.current?.getBoundingClientRect();
        if(!box||box.width===0||box.height===0)return;
        const dx=(ev.clientX-sx)/box.width,dy=(ev.clientY-sy)/box.height;
        let{x,y,w,h}=base;
        if(edges.r)w=base.w+dx;else if(edges.l){x=base.x+dx;w=base.w-dx;}
        if(edges.bb)h=base.h+dy;else if(edges.t){y=base.y+dy;h=base.h-dy;}
        if(corner&&ev.shiftKey){
         const ratio=base.w*box.width/(base.h*box.height),wPx=w*box.width,hPx=h*box.height;
         if(Math.abs(wPx-base.w*box.width)>=Math.abs(hPx-base.h*box.height)){const h2=wPx/ratio/box.height;if(edges.t)y=base.y+(base.h-h2);h=h2;}
         else{const w2=hPx*ratio/box.width;if(edges.l)x=base.x+(base.w-w2);w=w2;}
        }
        if(w<0.01){if(edges.l)x=base.x+base.w-0.01;w=0.01;}
        if(h<0.01){if(edges.t)y=base.y+base.h-0.01;h=0.01;}
        writeRect({x,y,w,h},`orect-resize:${o.id}`);
       };
       const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
       window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
      };
      const style:CSSProperties={left:`${oRect.x*100}%`,top:`${oRect.y*100}%`,width:`${oRect.w*100}%`,height:`${oRect.h*100}%`,opacity:oOpacity,zIndex:2,cursor:'grab',touchAction:'none'};
      return <div key={o.id} title={o.title?.text||o.source}
       className={`absolute flex items-center justify-center ${selOverlay?'outline-2 outline-[var(--accent)]':''}`}
       style={style} onPointerDown={beginDrag} data-testid="video-overlay-preview" data-overlay-id={o.id} data-selected={selOverlay||undefined}>
       <div className="pointer-events-none flex h-full w-full items-center justify-center">
        {o.kind==='title'
         ?<TitlePreview clip={{id:o.id,kind:'title',source:'',in_s:0,out_s:o.duration,gain:1,muted:false,title:o.title??DEFAULT_TITLE}} time={Math.max(0,playhead-o.at)} aspect={(o.rect.w*(v?.width??16))/(o.rect.h*(v?.height??9))} label={o.title?.text??'Overlay'}/>
         :o.kind==='image'
         ?<img src={urlOf(o.source)} alt="" className="max-h-full max-w-full object-contain"/>
         :<PipPreview o={o} playhead={playhead} playing={playing} rate={rateMul} url={urlOf(o.source)}/>}
       </div>
       {selOverlay&&([
        {k:'nw',edges:{l:true,t:true},pos:{left:'-5px',top:'-5px'},cur:'nwse-resize'},
        {k:'ne',edges:{r:true,t:true},pos:{right:'-5px',top:'-5px'},cur:'nesw-resize'},
        {k:'sw',edges:{l:true,bb:true},pos:{left:'-5px',bottom:'-5px'},cur:'nesw-resize'},
        {k:'se',edges:{r:true,bb:true},pos:{right:'-5px',bottom:'-5px'},cur:'nwse-resize'},
        {k:'n',edges:{t:true},pos:{left:'50%',top:'-5px',transform:'translateX(-50%)'},cur:'ns-resize'},
        {k:'s',edges:{bb:true},pos:{left:'50%',bottom:'-5px',transform:'translateX(-50%)'},cur:'ns-resize'},
        {k:'w',edges:{l:true},pos:{left:'-5px',top:'50%',transform:'translateY(-50%)'},cur:'ew-resize'},
        {k:'e',edges:{r:true},pos:{right:'-5px',top:'50%',transform:'translateY(-50%)'},cur:'ew-resize'},
       ] as const).map(hd=><div key={hd.k} role="separator" aria-label={t('video.overlayResize')} title={t('video.overlayResizeHint')} tabIndex={hd.k==='se'?0:-1}
        className="absolute h-2.5 w-2.5 rounded-sm bg-[var(--accent)]"
        style={{...(hd.pos as CSSProperties),cursor:hd.cur}}
        onPointerDown={beginResize(hd.edges)}
        onKeyDown={hd.k==='se'?e=>{const d=e.shiftKey?0.05:0.01;
         if(e.key==='ArrowLeft'){e.preventDefault();writeRect({...oRect,w:oRect.w-d},`orect-resize:${o.id}`);}
         else if(e.key==='ArrowRight'){e.preventDefault();writeRect({...oRect,w:oRect.w+d},`orect-resize:${o.id}`);}
         else if(e.key==='ArrowUp'){e.preventDefault();writeRect({...oRect,h:oRect.h-d},`orect-resize:${o.id}`);}
         else if(e.key==='ArrowDown'){e.preventDefault();writeRect({...oRect,h:oRect.h+d},`orect-resize:${o.id}`);}}:undefined}
        data-testid="overlay-resize-handle" data-handle-pos={hd.k}/>)}
      </div>;
     })}
    </div>
    <div className="flex items-center gap-3 px-4 pt-2 text-[12px] text-ink-2">
     <Button size="icon" variant="outline" aria-label={t(playing?'video.pause':'video.play')} aria-pressed={playing} disabled={!playable||!clips.length} onClick={toggle} data-testid="video-play">{playing?<Pause size={16}/>:<Play size={16}/>}</Button>
     <Button size="icon" variant="ghost" aria-label={t('video.frameBack')} disabled={!playable||!clips.length} onClick={()=>step(-1)} data-testid="video-frame-back"><ChevronsLeft size={16}/></Button>
     <Button size="icon" variant="ghost" aria-label={t('video.frameFwd')} disabled={!playable||!clips.length} onClick={()=>step(1)} data-testid="video-frame-fwd"><ChevronsRight size={16}/></Button>
     <Button size="icon" variant={recording?'outline':'ghost'} aria-label={t(recording?'video.voiceoverStop':'video.voiceoverRecord')} aria-pressed={recording} disabled={!playable||!clips.length||exporting} onClick={toggleVoiceover} data-testid="video-voiceover-record"><Mic size={16}/>{recording&&<span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true"/>}</Button>
     <span className="tabular-nums" data-testid="video-time">{formatTime(playhead)} / {formatTime(duration)}</span>
     <Button size="icon" variant="ghost" aria-label={t('video.split')} title={t('video.splitHint')} disabled={!entry||exporting} onClick={splitHere} data-testid="video-split"><Scissors size={16}/></Button>
     {voiceoverError&&<span className="text-red-500" data-testid="video-voiceover-error">{voiceoverError}</span>}
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
      overlayLane={<OverlayLane clips={overlayClips} selectedId={session?.selectedOverlayClipId??null} duration={domain}
       onSelect={id=>selectOverlayClip(item.name,id)}
       onMoveAt={(id,at)=>moveOverlayClip(item.name,id,at,`omove:${id}`)}
       onResize={(id,end)=>setOverlayDuration(item.name,id,Math.max(0.05,end-(overlayClips.find(c=>c.id===id)?.at??0)),`odur:${id}`)}
       snapPoints={timelineSnapPoints}
       label={t('video.overlayTrack')}/>}
      audioLane={<AudioLane clips={audioClips} selectedId={session?.selectedAudioClipId??null} duration={domain} controller={filmstrip}
       onSelect={id=>selectAudioTrackClip(item.name,id)}
       onMoveAt={(id,at)=>moveAudioTrackClip(item.name,id,at,`amove:${id}`)}
       onResize={(id,edge,t2)=>resizeAudioTrackClip(item.name,id,edge,t2,`atrim:${id}:${edge}`)}
       onDuplicate={id=>duplicateAudioTrackClip(item.name,id)}
       snapPoints={timelineSnapPoints}
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
