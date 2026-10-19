import {panelSection as row, panelCheck as check, panelFieldCompact as field} from '../shell/panelStyles';
import {useMemo,useState} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {useMedia} from '../../lib/media';
import {addAudioTrackClip,addImageClip,addOverlayImage,addOverlayTitle,addOverlayVideo,importSubtitleText,addTimelineClip,addTimelineClipsFromDialog,cancelVideoExport,deleteAudioTrackClip,deleteTimelineClip,duplicateAudioTrackClip,moveAudioTrackClip,moveTimelineClip,resetTimeline,resizeAudioTrackClip,setAudioTrackClipDuck,setAudioTrackClipFades,setAudioTrackClipGain,toggleAudioTrackClipMute,setTimelineClipCrossfade,setTimelineClipFades,setTimelineClipFreeze,setTimelineClipGain,setTimelineClipSpeed,setVideoFormat,duplicateTimelineClip,replaceClipSource,selectTimelineClip,setImageClipLength,clearTimelineClipCropKeys,setTimelineClipCrop,setTimelineClipCropKey,setTimelineClipCropKeys,setTimelineClipFlip,setTimelineClipGainKey,clearTimelineClipGainKeys,setTimelineClipReversed,setTimelineClipRotation,setVideoExportOptions,setVideoExportRange,toggleTimelineClipMute,trimTimelineClip,useVideoSession,deleteOverlayClip,moveOverlayClip,selectOverlayClip,setOverlayDuration,setOverlayGain,setOverlayInS,clearOverlayKeys,setOverlayOpacity,setOverlayOpacityKey,setOverlayRect,setOverlayRectKey,useVideoPlayhead,updateOverlayTitle} from '../../lib/video/session';
import {audioClipDuration,audioTrackEnd} from '../../lib/video/audioTrack';
import {decodeSubtitleBytes} from '../../lib/video/subtitles';
import {overlayTrackEnd,overlayOpacityAt,overlayRectAt} from '../../lib/video/overlayTrack';
import {clipDuration,clipRanges,fadeInOf,fadeOf,fadeOutOf,cropAt,cropOf,gainAt,kenBurnsPreset,flipOf,rotationOf,isFreeze,isReversed,IMAGE_DEFAULT_SECONDS,isImageClip,MAX_GAIN,speedOf,timelineDuration,type ClipFlip,type ClipRotation} from '../../lib/video/timeline';
import {isTitleClip} from '../../lib/video/titles';
import {addTitleClip,setTitleLength,updateTitle} from '../../lib/video/titleSession';
import {TitleAddRow,TitleInspector} from './TitleInspector';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {colorOf,hasColor,type ClipColor} from '../../lib/video/colorAdjust';
import {setTimelineClipColor} from '../../lib/video/session';

const COLOR_CHANNELS=['brightness','contrast','saturation'] as const;
/** Brightness, contrast and saturation of the selected clip (-100..100). Dragging is one undo step. */
function ClipColorControls({name,clip}:{name:string;clip:import('../../lib/video/timeline').TimelineClip}){
 const t=useT();const v=colorOf(clip);
 return <div className="grid gap-1" data-testid="video-clip-color">
  <div className="flex items-center justify-between">{t('video.clipColor')}
   <Button size="compact" disabled={!hasColor(clip)} onClick={()=>setTimelineClipColor(name,clip.id,{brightness:0,contrast:0,saturation:0})} data-testid="video-clip-color-reset">{t('video.clipColorReset')}</Button>
  </div>
  {COLOR_CHANNELS.map(ch=><label key={ch} className="grid gap-1">{t(`video.clipColor.${ch}`,{value:v[ch]})}
   <NativeInput type="range" className="accent-[var(--accent)]" min={-100} max={100} step={1} value={v[ch]} onChange={e=>setTimelineClipColor(name,clip.id,{[ch]:Number(e.target.value)} as Partial<ClipColor>,`color:${clip.id}:${ch}`)} data-testid={`video-clip-color-${ch}`}/>
  </label>)}
 </div>;
}



/** Facts, timeline, selected-clip and export settings of the active video project. Playback lives in the workspace. */
export function VideoControls({name}:{name:string}){
 const {t}=useT();const s=useVideoSession(name);
 const playhead=useVideoPlayhead();
 const media=useMedia();
 const [addPick,setAddPick]=useState('');
 const [addAudioPick,setAddAudioPick]=useState('');
 const [addImagePick,setAddImagePick]=useState('');
 const [swapPick,setSwapPick]=useState('');
 const [addOverlayPick,setAddOverlayPick]=useState('');
 const [addOverlayVideoPick,setAddOverlayVideoPick]=useState('');
 const candidates=useMemo(()=>media.items.filter(i=>i.kind==='video'),[media.items]);
 const audioCandidates=useMemo(()=>media.items.filter(i=>i.kind==='audio'),[media.items]);
 const imageCandidates=useMemo(()=>media.items.filter(i=>i.kind==='image'),[media.items]);
 const videoCandidates=useMemo(()=>media.items.filter(i=>i.kind==='video'),[media.items]);
 if(!s)return <p className="p-3 text-xs text-ink-3">{t('video.loading')}</p>;
 const ready=s.status==='ready'||s.status==='exporting';
 const p=s.probe,v=p?.video,a=p?.audio,dur=p?.duration??0;
 const caps=s.capabilities;
 const mp4Silent=!!caps&&caps.mp4Video!==null&&!caps.aac;
 const mp4Disabled=!caps||caps.mp4Video===null;
 const webmDisabled=!caps||caps.webmVideo===null;
 const channels=a?(a.channels===1?t('video.mono'):a.channels===2?t('video.stereo'):t('video.channelsN',{count:a.channels})):'';
 const selected=s.clips.find(c=>c.id===s.selectedClipId)??null;
 const selectedAudio=s.audioClips.find(c=>c.id===s.selectedAudioClipId)??null;
 const selectedOverlay=s.overlayClips.find(c=>c.id===s.selectedOverlayClipId)??null;
 const selectedIndex=selected?s.clips.findIndex(c=>c.id===selected.id):-1;
 return <fieldset disabled={!ready} className="m-0 min-w-0 border-0 p-0" data-testid="video-controls">
  <div className={row} data-testid="video-facts">
   <span className="text-ink">{t('video.facts')}</span>
   {v&&<span className="text-ink-3">{t('video.info',{duration:dur.toFixed(2),width:v.width,height:v.height,codec:v.codec??'?'})}{v.fps?` · ${t('video.infoFps',{fps:v.fps})}`:''}</span>}
   <span className="text-ink-3" data-testid="video-facts-audio">{a?t('video.audioInfo',{codec:a.codec??'?',channels,rate:a.rate}):t('video.noAudio')}</span>
  </div>
  <div className={row} data-testid="video-timeline-panel">
   <span className="text-ink">{t('video.timelinePanel')}</span>
   <span className="text-ink-3" data-testid="video-timeline-summary">{t('video.timelineSummary',{count:s.clips.length,duration:timelineDuration(s.clips).toFixed(2)})}</span>
   <div className="flex items-center gap-2">
    <NativeSelect className={field} value={addPick} onChange={e=>setAddPick(e.target.value)} aria-label={t('video.addClipPick')} data-testid="video-add-pick">
     <option value="">{t('video.addClipPick')}</option>
     {candidates.map(i=><option key={i.name} value={i.name}>{i.name}</option>)}
    </NativeSelect>
    <Button size="compact" disabled={!addPick} onClick={()=>{const item=candidates.find(i=>i.name===addPick);if(item)void addTimelineClip(name,item);setAddPick('');}} data-testid="video-add-clip">{t('video.addClip')}</Button>
    <Button size="compact" variant="outline" onClick={()=>void addTimelineClipsFromDialog(name)} data-testid="video-add-open">{t('video.addOpen')}</Button>
   </div>
   <div className="flex items-center gap-2">
    <NativeSelect className={field} value={addImagePick} onChange={e=>setAddImagePick(e.target.value)} aria-label={t('video.addImagePick')} data-testid="video-add-image-pick">
     <option value="">{t('video.addImagePick')}</option>
     {imageCandidates.map(i=><option key={i.name} value={i.name}>{i.name}</option>)}
    </NativeSelect>
    <Button size="compact" disabled={!addImagePick} onClick={()=>{const item=imageCandidates.find(i=>i.name===addImagePick);if(item)addImageClip(name,item,IMAGE_DEFAULT_SECONDS);setAddImagePick('');}} data-testid="video-add-image">{t('video.addImage')}</Button>
   </div>
   <p className="m-0 text-ink-3">{t('video.timelineHint')}</p>
  </div>
  <div className={row} data-testid="video-audio-track-panel">
   <span className="text-ink">{t('video.audioTrack')}</span>
   <span className="text-ink-3" data-testid="video-audio-track-summary">{s.audioClips.length?t('video.audioTrackSummary',{count:s.audioClips.length,duration:audioTrackEnd(s.audioClips).toFixed(2)}):t('video.audioTrackEmpty')}</span>
   <div className="flex items-center gap-2">
    <NativeSelect className={field} value={addAudioPick} onChange={e=>setAddAudioPick(e.target.value)} aria-label={t('video.audioAddPick')} data-testid="video-audio-add-pick">
     <option value="">{t('video.audioAddPick')}</option>
     {audioCandidates.map(i=><option key={i.name} value={i.name}>{i.name}</option>)}
    </NativeSelect>
    <Button size="compact" disabled={!addAudioPick} onClick={()=>{const item=audioCandidates.find(i=>i.name===addAudioPick);if(item)void addAudioTrackClip(name,item);setAddAudioPick('');}} data-testid="video-audio-add">{t('video.audioAdd')}</Button>
   </div>
   <p className="m-0 text-ink-3">{t('video.audioTrackHint')}</p>
  </div>
  <div className={row} data-testid="video-overlay-panel">
   <span className="text-ink">{t('video.overlayTrack')}</span>
   <span className="text-ink-3" data-testid="video-overlay-summary">{s.overlayClips.length?t('video.overlaySummary',{count:s.overlayClips.length,duration:overlayTrackEnd(s.overlayClips).toFixed(2)}):t('video.overlayEmpty')}</span>
   <div className="flex items-center gap-2">
    <Button size="compact" onClick={()=>addOverlayTitle(name,0)} data-testid="video-overlay-add-title">{t('video.overlayAddTitle')}</Button>
    <NativeSelect className={field} value={addOverlayPick} onChange={e=>setAddOverlayPick(e.target.value)} aria-label={t('video.overlayAddImage')} data-testid="video-overlay-add-pick">
     <option value="">{t('video.addImagePick')}</option>
     {imageCandidates.map(i=><option key={i.name} value={i.name}>{i.name}</option>)}
    </NativeSelect>
    <Button size="compact" disabled={!addOverlayPick} onClick={()=>{if(addOverlayPick){addOverlayImage(name,addOverlayPick,0);setAddOverlayPick('');}}} data-testid="video-overlay-add-image">{t('video.overlayAddImage')}</Button>
   </div>
   <div className="flex items-center gap-2">
    <NativeSelect className={field} value={addOverlayVideoPick} onChange={e=>setAddOverlayVideoPick(e.target.value)} aria-label={t('video.overlayAddVideo')} data-testid="video-overlay-add-video-pick">
     <option value="">{t('video.overlayAddVideoPick')}</option>
     {videoCandidates.map(i=><option key={i.name} value={i.name}>{i.name}</option>)}
    </NativeSelect>
    <Button size="compact" disabled={!addOverlayVideoPick} onClick={()=>{if(addOverlayVideoPick){addOverlayVideo(name,addOverlayVideoPick,0);setAddOverlayVideoPick('');}}} data-testid="video-overlay-add-video">{t('video.overlayAddVideo')}</Button>
    <Button size="compact" onClick={()=>{
     const input=document.createElement('input');input.type='file';input.accept='.srt,.vtt,.ass';
     input.onchange=async()=>{const f=input.files?.[0];if(f)importSubtitleText(name,decodeSubtitleBytes(new Uint8Array(await f.arrayBuffer())));};
     input.click();
    }} data-testid="video-overlay-import-subtitles">{t('video.subtitlesImport')}</Button>
   </div>
   {s.overlayClips.length>0&&<div className="grid gap-1">
    {s.overlayClips.map(o=><Button key={o.id} variant={o.id===s.selectedOverlayClipId?'outline':'ghost'} size="compact" className="justify-between" onClick={()=>selectOverlayClip(name,o.id===s.selectedOverlayClipId?null:o.id)} data-testid="video-overlay-item">
     <span className="truncate">{o.kind==='title'?(o.title?.text||'Title'):o.source}</span>
     <span className="tabular-nums">{o.at.toFixed(1)}s</span>
    </Button>)}
   </div>}
   <p className="m-0 text-ink-3">{t('video.overlayHint')}</p>
  </div>
  <TitleAddRow disabled={!ready} onAdd={()=>addTitleClip(name,selectedIndex>=0?clipRanges(s.clips)[selectedIndex].end:Number.MAX_SAFE_INTEGER)}/>
  {selected&&isTitleClip(selected)&&<>
   <TitleInspector clip={selected} onChange={p2=>updateTitle(name,selected.id,p2,`title:${selected.id}`)} onDuration={d=>setTitleLength(name,selected.id,d,`title-len:${selected.id}`)}/>
   <div className={row}>
    <div className="flex flex-wrap gap-2">
     <Button size="compact" variant="outline" disabled={selectedIndex<=0} onClick={()=>moveTimelineClip(name,selected.id,-1)} data-testid="video-clip-left">{t('video.moveLeft')}</Button>
     <Button size="compact" variant="outline" disabled={selectedIndex<0||selectedIndex>=s.clips.length-1} onClick={()=>moveTimelineClip(name,selected.id,1)} data-testid="video-clip-right">{t('video.moveRight')}</Button>
     <Button size="compact" variant="outline" onClick={()=>duplicateTimelineClip(name,selected.id)} data-testid="video-clip-duplicate">{t('video.duplicateClip')}</Button>
     <Button size="compact" variant="ghost" disabled={s.clips.length<=1} onClick={()=>{deleteTimelineClip(name,selected.id);selectTimelineClip(name,null);}} data-testid="video-clip-delete">{t('video.deleteClip')}</Button>
    </div>
    {selectedIndex>=0&&selectedIndex<s.clips.length-1&&<label>{t('video.transition')}
     <NativeInput type="number" className={`${field} mt-1`} min={0} max={clipDuration(selected)} step={0.1} value={fadeOf(selected)} onChange={e=>setTimelineClipCrossfade(name,selected.id,Number(e.target.value),`fade:${selected.id}`)} data-testid="video-clip-transition-duration"/>
    </label>}
   </div>
  </>}
  {selected&&isImageClip(selected)&&<div className={row} data-testid="video-image-panel">
   <span className="text-ink">{t('video.imageClipTitle')}</span>
   <span className="truncate text-ink-3" data-testid="video-image-source">{selected.source}</span>
   <div className="flex items-center gap-2">
    <NativeSelect className={field} value={swapPick} onChange={e=>setSwapPick(e.target.value)} aria-label={t('video.swapSourcePick')} data-testid="video-swap-pick">
     <option value="">{t('video.swapSourcePick')}</option>
     {imageCandidates.filter(i=>i.name!==selected.source).map(i=><option key={i.name} value={i.name}>{i.name}</option>)}
    </NativeSelect>
    <Button size="compact" disabled={!swapPick} onClick={()=>{const item=imageCandidates.find(i=>i.name===swapPick);if(item)void replaceClipSource(name,selected.id,item);setSwapPick('');}} data-testid="video-swap-source">{t('video.swapSource')}</Button>
   </div>
   <label>{t('video.imageDuration',{seconds:(selected.out_s-selected.in_s).toFixed(2)})}
    <NativeInput type="number" className={`${field} mt-1`} min={0.05} max={3600} step={0.5} value={selected.out_s} onChange={e=>setImageClipLength(name,selected.id,Number(e.target.value),`image-len:${selected.id}`)} data-testid="video-image-duration"/>
   </label>
   <ClipColorControls name={name} clip={selected}/>
   <label className="grid gap-1">{t('video.clipFlip')}
    <NativeSelect className={field} value={flipOf(selected)} onChange={e=>setTimelineClipFlip(name,selected.id,e.target.value as ClipFlip)} data-testid="video-clip-flip">
     {(['none','h','v','hv'] as const).map(f=><option key={f} value={f}>{t(`video.clipFlip.${f}`)}</option>)}
    </NativeSelect>
   </label>
   <label className="grid gap-1">{t('video.clipRotate')}
    <NativeSelect className={field} value={String(rotationOf(selected))} onChange={e=>setTimelineClipRotation(name,selected.id,Number(e.target.value) as ClipRotation)} data-testid="video-clip-rotate">
     {([0,90,180,270] as const).map(r=><option key={r} value={r}>{t(`video.clipRotate.${r}`)}</option>)}
    </NativeSelect>
   </label>
   <label className="grid gap-1">{t('video.crop')}
    <div className="grid grid-cols-2 gap-2">
     {(['left','top','right','bottom'] as const).map(edge=><label key={edge}>{t(`video.crop.${edge}`)}
      <NativeInput type="number" className={`${field} mt-1`} min={0} max={90} step={1} value={Math.round((selected.cropKeys?.length?cropAt(selected,Math.max(0,playhead-(clipRanges(s.clips).find(r=>r.clip.id===selected.id)?.start??0))):cropOf(selected))[edge]*100)} onChange={e=>{const base=selected.cropKeys?.length?cropAt(selected,Math.max(0,playhead-(clipRanges(s.clips).find(r=>r.clip.id===selected.id)?.start??0))):cropOf(selected);const next={...base,[edge]:Math.min(90,Math.max(0,Number(e.target.value)||0))/100};if(selected.cropKeys?.length)setTimelineClipCropKey(name,selected.id,Math.max(0,playhead-(clipRanges(s.clips).find(r=>r.clip.id===selected.id)?.start??0)),next,`cropkey:${selected.id}`);else setTimelineClipCrop(name,selected.id,next);}} data-testid={`video-clip-crop-${edge}`}/>
     </label>)}
    </div>
   </label>
   <div className="flex items-center gap-2">
    {!selected.cropKeys?.length
     ?<Button size="compact" variant="ghost" onClick={()=>setTimelineClipCropKeys(name,selected.id,kenBurnsPreset(clipDuration(selected)))} data-testid="video-clip-kenburns">{t('video.kenBurns')}</Button>
     :<><span className="text-ink-3" data-testid="video-clip-crop-keys">{t('video.overlayKeysActive',{count:selected.cropKeys.length})}</span><Button size="compact" variant="ghost" onClick={()=>clearTimelineClipCropKeys(name,selected.id)} data-testid="video-clip-crop-keys-clear">{t('video.overlayKeysClear')}</Button></>}
   </div>
   <div className="flex flex-wrap gap-2">
    <Button size="compact" variant="outline" disabled={selectedIndex<=0} onClick={()=>moveTimelineClip(name,selected.id,-1)} data-testid="video-clip-left">{t('video.moveLeft')}</Button>
    <Button size="compact" variant="outline" disabled={selectedIndex<0||selectedIndex>=s.clips.length-1} onClick={()=>moveTimelineClip(name,selected.id,1)} data-testid="video-clip-right">{t('video.moveRight')}</Button>
    <Button size="compact" variant="outline" onClick={()=>duplicateTimelineClip(name,selected.id)} data-testid="video-clip-duplicate">{t('video.duplicateClip')}</Button>
    <Button size="compact" variant="ghost" disabled={s.clips.length<=1&&media.items.find(i=>i.name===name)?.kind!=='video-project'} onClick={()=>{deleteTimelineClip(name,selected.id);selectTimelineClip(name,null);}} data-testid="video-clip-delete">{t('video.deleteClip')}</Button>
   </div>
   {selectedIndex>=0&&selectedIndex<s.clips.length-1&&<label>{t('video.transition')}
    <NativeInput type="number" className={`${field} mt-1`} min={0} max={Math.min(clipDuration(selected),clipDuration(s.clips[selectedIndex+1]))} step={0.1} value={fadeOf(selected)} onChange={e=>setTimelineClipCrossfade(name,selected.id,Number(e.target.value),`fade:${selected.id}`)} data-testid="video-image-transition"/>
   </label>}
   <p className="m-0 text-ink-3">{t('video.imageHint')}</p>
  </div>}
  {selected&&!isTitleClip(selected)&&!isImageClip(selected)&&<div className={row} data-testid="video-clip-panel">
   <span className="text-ink">{t('video.clipTitle',{index:selectedIndex+1})}</span>
   <span className="truncate text-ink-3" data-testid="video-clip-source">{selected.source}</span>
   <div className="flex items-center gap-2">
    <NativeSelect className={field} value={swapPick} onChange={e=>setSwapPick(e.target.value)} aria-label={t('video.swapSourcePick')} data-testid="video-swap-pick">
     <option value="">{t('video.swapSourcePick')}</option>
     {candidates.filter(i=>i.name!==selected.source).map(i=><option key={i.name} value={i.name}>{i.name}</option>)}
    </NativeSelect>
    <Button size="compact" disabled={!swapPick} onClick={()=>{const item=candidates.find(i=>i.name===swapPick);if(item)void replaceClipSource(name,selected.id,item);setSwapPick('');}} data-testid="video-swap-source">{t('video.swapSource')}</Button>
   </div>
   <div className="grid grid-cols-2 gap-2">
    {!isFreeze(selected)&&<label>{t('video.trimStart')}<NativeInput type="number" className={`${field} mt-1`} min={0} step={0.01} value={selected.in_s} onChange={e=>trimTimelineClip(name,selected.id,'in',Number(e.target.value),`trim:${selected.id}:in`)} data-testid="video-clip-in-input"/></label>}
    <label>{t('video.trimEnd')}<NativeInput type="number" className={`${field} mt-1`} min={0} step={0.01} value={selected.out_s} onChange={e=>trimTimelineClip(name,selected.id,'out',Number(e.target.value),`trim:${selected.id}:out`)} data-testid="video-clip-out-input"/></label>
   </div>
   {!isFreeze(selected)&&<label className="grid gap-1">{t('video.clipSpeed')}
    <NativeSelect className={field} value={String(speedOf(selected))} onChange={e=>setTimelineClipSpeed(name,selected.id,Number(e.target.value))} data-testid="video-clip-speed">
     {[0.25,0.5,0.75,1,1.25,1.5,2,3,4].map(v=><option key={v} value={v}>{t('video.clipSpeedValue',{speed:v})}</option>)}
    </NativeSelect>
   </label>}
   <ClipColorControls name={name} clip={selected}/>
   <label className="grid gap-1">{t('video.clipFlip')}
    <NativeSelect className={field} value={flipOf(selected)} onChange={e=>setTimelineClipFlip(name,selected.id,e.target.value as ClipFlip)} data-testid="video-clip-flip">
     {(['none','h','v','hv'] as const).map(f=><option key={f} value={f}>{t(`video.clipFlip.${f}`)}</option>)}
    </NativeSelect>
   </label>
   <label className="grid gap-1">{t('video.clipRotate')}
    <NativeSelect className={field} value={String(rotationOf(selected))} onChange={e=>setTimelineClipRotation(name,selected.id,Number(e.target.value) as ClipRotation)} data-testid="video-clip-rotate">
     {([0,90,180,270] as const).map(r=><option key={r} value={r}>{t(`video.clipRotate.${r}`)}</option>)}
    </NativeSelect>
   </label>
   <label className="grid gap-1">{t('video.crop')}
    <div className="grid grid-cols-2 gap-2">
     {(['left','top','right','bottom'] as const).map(edge=><label key={edge}>{t(`video.crop.${edge}`)}
      <NativeInput type="number" className={`${field} mt-1`} min={0} max={90} step={1} value={Math.round(cropOf(selected)[edge]*100)} onChange={e=>{const cr=cropOf(selected);setTimelineClipCrop(name,selected.id,{...cr,[edge]:Math.min(90,Math.max(0,Number(e.target.value)||0))/100});}} data-testid={`video-clip-crop-${edge}`}/>
     </label>)}
    </div>
   </label>
   <label className="flex items-center gap-2"><NativeInput type="checkbox" className={check} checked={isFreeze(selected)} onChange={()=>setTimelineClipFreeze(name,selected.id,isFreeze(selected)?null:selected.in_s)} data-testid="video-clip-freeze"/>{t('video.freeze')}</label>
   {!isFreeze(selected)&&<label className="flex items-center gap-2"><NativeInput type="checkbox" className={check} checked={isReversed(selected)} onChange={()=>setTimelineClipReversed(name,selected.id,!isReversed(selected))} data-testid="video-clip-reverse"/>{t('video.reverse')}</label>}
   {!isFreeze(selected)&&isReversed(selected)&&<p className="m-0 text-ink-3" data-testid="video-clip-reverse-hint">{t('video.reverseHint')}</p>}
   {isFreeze(selected)&&<label>{t('video.freezeAt')}<NativeInput type="number" className={`${field} mt-1`} min={0} step={0.1} value={selected.freeze} onChange={e=>setTimelineClipFreeze(name,selected.id,Number(e.target.value))} data-testid="video-clip-freeze-at"/></label>}
   <label className="grid gap-1">{t('video.gain',{percent:Math.round((selected.gainKeys?.length?gainAt(selected,Math.max(0,playhead-(clipRanges(s.clips).find(r=>r.clip.id===selected.id)?.start??0))):selected.gain)*100)})}
    <NativeInput type="range" className="accent-[var(--accent)]" min={0} max={MAX_GAIN} step={0.05} value={selected.gainKeys?.length?gainAt(selected,Math.max(0,playhead-(clipRanges(s.clips).find(r=>r.clip.id===selected.id)?.start??0))):selected.gain} onChange={e=>{const v=Number(e.target.value);if(selected.gainKeys?.length)setTimelineClipGainKey(name,selected.id,Math.max(0,playhead-(clipRanges(s.clips).find(r=>r.clip.id===selected.id)?.start??0)),v,`gainkey:${selected.id}`);else setTimelineClipGain(name,selected.id,v,`gain:${selected.id}`);}} data-testid="video-clip-gain"/>
   </label>
   {!isFreeze(selected)&&<div className="flex flex-wrap items-center gap-2">
    {!selected.gainKeys?.length
     ?<Button size="compact" variant="ghost" onClick={()=>setTimelineClipGainKey(name,selected.id,0,selected.gain)} data-testid="video-clip-gain-animate">{t('video.gainAnimate')}</Button>
     :<><span className="text-ink-3" data-testid="video-clip-gain-keys">{t('video.overlayKeysActive',{count:selected.gainKeys.length})}</span><Button size="compact" variant="ghost" onClick={()=>clearTimelineClipGainKeys(name,selected.id)} data-testid="video-clip-gain-keys-clear">{t('video.overlayKeysClear')}</Button></>}
   </div>}
   <div className="grid grid-cols-2 gap-2">
    <label>{t('video.audioFadeIn')}<NativeInput type="number" className={`${field} mt-1`} min={0} max={clipDuration(selected)} step={0.1} value={fadeInOf(selected)} onChange={e=>setTimelineClipFades(name,selected.id,Number(e.target.value),fadeOutOf(selected))} data-testid="video-clip-fade-in"/></label>
    <label>{t('video.audioFadeOut')}<NativeInput type="number" className={`${field} mt-1`} min={0} max={clipDuration(selected)} step={0.1} value={fadeOutOf(selected)} onChange={e=>setTimelineClipFades(name,selected.id,fadeInOf(selected),Number(e.target.value))} data-testid="video-clip-fade-out"/></label>
   </div>
   <label className="flex items-center gap-2"><NativeInput type="checkbox" className={check} checked={selected.muted} onChange={()=>toggleTimelineClipMute(name,selected.id)} data-testid="video-clip-mute"/>{t('video.clipMute')}</label>
   {selectedIndex>=0&&selectedIndex<s.clips.length-1&&<label>{t('video.transition')}
    <NativeInput type="number" className={`${field} mt-1`} min={0} max={Math.min(clipDuration(selected),clipDuration(s.clips[selectedIndex+1]))} step={0.1} value={fadeOf(selected)} onChange={e=>setTimelineClipCrossfade(name,selected.id,Number(e.target.value),`fade:${selected.id}`)} data-testid="video-clip-transition-duration"/>
   </label>}
   <div className="flex flex-wrap gap-2">
    <Button size="compact" variant="outline" disabled={selectedIndex<=0} onClick={()=>moveTimelineClip(name,selected.id,-1)} data-testid="video-clip-left">{t('video.moveLeft')}</Button>
    <Button size="compact" variant="outline" disabled={selectedIndex<0||selectedIndex>=s.clips.length-1} onClick={()=>moveTimelineClip(name,selected.id,1)} data-testid="video-clip-right">{t('video.moveRight')}</Button>
    <Button size="compact" variant="outline" onClick={()=>duplicateTimelineClip(name,selected.id)} data-testid="video-clip-duplicate">{t('video.duplicateClip')}</Button>
    <Button size="compact" variant="ghost" disabled={s.clips.length<=1&&media.items.find(i=>i.name===name)?.kind!=='video-project'} onClick={()=>{deleteTimelineClip(name,selected.id);selectTimelineClip(name,null);}} data-testid="video-clip-delete">{t('video.deleteClip')}</Button>
   </div>
   <p className="m-0 text-ink-3">{t('video.clipHint')}</p>
  </div>}
  {selectedOverlay&&<div className={row} data-testid="video-overlay-clip-panel">
   <span className="text-ink">{t('video.overlayClipTitle')}</span>
   <span className="truncate text-ink-3" data-testid="video-overlay-source">{selectedOverlay.kind==='title'?(selectedOverlay.title?.text??''):selectedOverlay.source}</span>
   {selectedOverlay.kind==='title'&&<label>{t('video.overlayText')}<NativeInput className={`${field} mt-1`} value={selectedOverlay.title?.text??''} onChange={e=>updateOverlayTitle(name,selectedOverlay.id,{text:e.target.value})} data-testid="video-overlay-text"/></label>}
   {selectedOverlay.kind==='title'&&<label>{t('video.card.animate')}<NativeSelect className={`${field} mt-1`} value={selectedOverlay.title?.animate??'none'} onChange={e=>updateOverlayTitle(name,selectedOverlay.id,{animate:e.target.value as 'none'|'rise'|'drop'|'slide'})} data-testid="video-overlay-animate">
    <option value="none">{t('video.card.animateNone')}</option><option value="rise">{t('video.card.animateRise')}</option><option value="drop">{t('video.card.animateDrop')}</option><option value="slide">{t('video.card.animateSlide')}</option></NativeSelect></label>}
   {selectedOverlay.kind==='title'&&<label>{t('video.overlayBgAlpha',{percent:Math.round((selectedOverlay.title?.bgAlpha??1)*100)})}
    <NativeInput type="range" className="accent-[var(--accent)]" min={0} max={1} step={0.05} value={selectedOverlay.title?.bgAlpha??1} onChange={e=>updateOverlayTitle(name,selectedOverlay.id,{bgAlpha:Number(e.target.value)})} data-testid="video-overlay-bg-alpha"/>
   </label>}
   {selectedOverlay.kind==='video'&&<label>{t('video.trimStart')}<NativeInput type="number" className={`${field} mt-1`} min={0} step={0.1} value={selectedOverlay.in_s} onChange={e=>setOverlayInS(name,selectedOverlay.id,Number(e.target.value),`oins:${selectedOverlay.id}`)} data-testid="video-overlay-in"/></label>}
   {selectedOverlay.kind==='video'&&<label>{t('video.gain',{percent:Math.round(selectedOverlay.gain*100)})}
    <NativeInput type="range" className="accent-[var(--accent)]" min={0} max={2} step={0.05} value={selectedOverlay.gain} onChange={e=>setOverlayGain(name,selectedOverlay.id,Number(e.target.value),`ogain:${selectedOverlay.id}`)} data-testid="video-overlay-gain"/>
   </label>}
   <div className="grid grid-cols-2 gap-2">
    <label>{t('video.audioAt')}<NativeInput type="number" className={`${field} mt-1`} min={0} step={0.1} value={selectedOverlay.at} onChange={e=>moveOverlayClip(name,selectedOverlay.id,Number(e.target.value),`omove:${selectedOverlay.id}`)} data-testid="video-overlay-at"/></label>
    <label>{t('video.overlayDuration')}<NativeInput type="number" className={`${field} mt-1`} min={0.05} max={3600} step={0.1} value={selectedOverlay.duration} onChange={e=>setOverlayDuration(name,selectedOverlay.id,Number(e.target.value))} data-testid="video-overlay-duration"/></label>
   </div>
   <div className="grid grid-cols-2 gap-2">
    {(['x','y','w','h'] as const).map(k=><label key={k}>{t(`video.overlayRect.${k}`)}
     <NativeInput type="number" className={`${field} mt-1`} min={0} max={100} step={1} value={Math.round((selectedOverlay.rectKeys?.length?overlayRectAt(selectedOverlay,playhead):selectedOverlay.rect)[k]*100)} onChange={e=>{const val=Math.min(100,Math.max(0,Number(e.target.value)||0))/100;const next={...overlayRectAt(selectedOverlay,playhead),[k]:val};if(selectedOverlay.rectKeys?.length)setOverlayRectKey(name,selectedOverlay.id,Math.max(0,playhead-selectedOverlay.at),next,`orect:${selectedOverlay.id}:${k}`);else setOverlayRect(name,selectedOverlay.id,next,`orect:${selectedOverlay.id}:${k}`);}} data-testid={`video-overlay-rect-${k}`}/>
    </label>)}
   </div>
   <div className="flex items-center gap-2">
    {!selectedOverlay.rectKeys?.length
     ?<Button size="compact" variant="ghost" onClick={()=>setOverlayRectKey(name,selectedOverlay.id,Math.max(0,playhead-selectedOverlay.at),overlayRectAt(selectedOverlay,playhead))} data-testid="video-overlay-rect-animate">{t('video.overlayAnimateRect')}</Button>
     :<><span className="text-ink-3" data-testid="video-overlay-rect-keys">{t('video.overlayKeysActive',{count:selectedOverlay.rectKeys.length})}</span><Button size="compact" variant="ghost" onClick={()=>clearOverlayKeys(name,selectedOverlay.id,'rect')} data-testid="video-overlay-rect-keys-clear">{t('video.overlayKeysClear')}</Button></>}
   </div>
   <label>{t('video.overlayOpacity',{percent:Math.round((selectedOverlay.opacityKeys?.length?overlayOpacityAt(selectedOverlay,playhead):selectedOverlay.opacity)*100)})}
    <NativeInput type="range" className="accent-[var(--accent)]" min={0} max={1} step={0.05} value={selectedOverlay.opacityKeys?.length?overlayOpacityAt(selectedOverlay,playhead):selectedOverlay.opacity} onChange={e=>{const v=Number(e.target.value);if(selectedOverlay.opacityKeys?.length)setOverlayOpacityKey(name,selectedOverlay.id,Math.max(0,playhead-selectedOverlay.at),v,`oopacity:${selectedOverlay.id}`);else setOverlayOpacity(name,selectedOverlay.id,v,`oopacity:${selectedOverlay.id}`);}} data-testid="video-overlay-opacity"/>
   </label>
   <div className="flex items-center gap-2">
    {!selectedOverlay.opacityKeys?.length
     ?<Button size="compact" variant="ghost" onClick={()=>setOverlayOpacityKey(name,selectedOverlay.id,Math.max(0,playhead-selectedOverlay.at),selectedOverlay.opacity)} data-testid="video-overlay-opacity-animate">{t('video.overlayAnimateOpacity')}</Button>
     :<><span className="text-ink-3" data-testid="video-overlay-opacity-keys">{t('video.overlayKeysActive',{count:selectedOverlay.opacityKeys.length})}</span><Button size="compact" variant="ghost" onClick={()=>clearOverlayKeys(name,selectedOverlay.id,'opacity')} data-testid="video-overlay-opacity-keys-clear">{t('video.overlayKeysClear')}</Button></>}
   </div>
   <Button size="compact" variant="ghost" onClick={()=>deleteOverlayClip(name,selectedOverlay.id)} data-testid="video-overlay-delete">{t('video.deleteClip')}</Button>
  </div>}
  {selectedAudio&&<div className={row} data-testid="video-audio-clip-panel">
   <span className="text-ink">{t('video.audioClipTitle')}</span>
   <span className="truncate text-ink-3" data-testid="video-audio-clip-source">{selectedAudio.source}</span>
   <div className="grid grid-cols-2 gap-2">
    <label>{t('video.audioAt')}<NativeInput type="number" className={`${field} mt-1`} min={0} step={0.1} value={selectedAudio.at} onChange={e=>moveAudioTrackClip(name,selectedAudio.id,Number(e.target.value),`amove:${selectedAudio.id}`)} data-testid="video-audio-clip-at"/></label>
    <label>{t('video.gain',{percent:Math.round(selectedAudio.gain*100)})}
     <NativeInput type="range" className="mt-2 accent-[var(--accent)]" min={0} max={MAX_GAIN} step={0.05} value={selectedAudio.gain} onChange={e=>setAudioTrackClipGain(name,selectedAudio.id,Number(e.target.value),`again:${selectedAudio.id}`)} data-testid="video-audio-clip-gain"/></label>
   </div>
   <div className="grid grid-cols-2 gap-2">
    <label>{t('video.trimStart')}<NativeInput type="number" className={`${field} mt-1`} min={0} step={0.01} value={selectedAudio.in_s} onChange={e=>resizeAudioTrackClip(name,selectedAudio.id,'in',selectedAudio.at+Number(e.target.value)-selectedAudio.in_s,`atrim:${selectedAudio.id}:in`)} data-testid="video-audio-clip-in-input"/></label>
    <label>{t('video.trimEnd')}<NativeInput type="number" className={`${field} mt-1`} min={0} step={0.01} value={selectedAudio.out_s} onChange={e=>resizeAudioTrackClip(name,selectedAudio.id,'out',selectedAudio.at+Number(e.target.value)-selectedAudio.in_s,`atrim:${selectedAudio.id}:out`)} data-testid="video-audio-clip-out-input"/></label>
   </div>
   <div className="grid grid-cols-2 gap-2">
    <label>{t('video.audioFadeIn')}<NativeInput type="number" className={`${field} mt-1`} min={0} max={audioClipDuration(selectedAudio)} step={0.1} value={selectedAudio.fadeIn} onChange={e=>setAudioTrackClipFades(name,selectedAudio.id,Number(e.target.value),selectedAudio.fadeOut)} data-testid="video-audio-clip-fade-in"/></label>
    <label>{t('video.audioFadeOut')}<NativeInput type="number" className={`${field} mt-1`} min={0} max={audioClipDuration(selectedAudio)} step={0.1} value={selectedAudio.fadeOut} onChange={e=>setAudioTrackClipFades(name,selectedAudio.id,selectedAudio.fadeIn,Number(e.target.value))} data-testid="video-audio-clip-fade-out"/></label>
   </div>
   <div className="grid grid-cols-2 items-end gap-2">
    <label className="flex items-center gap-2"><NativeInput type="checkbox" className={check} checked={selectedAudio.muted} onChange={()=>toggleAudioTrackClipMute(name,selectedAudio.id)} data-testid="video-audio-clip-mute"/>{t('video.clipMute')}</label>
    <label>{t('video.audioDuck')}
     <NativeSelect className={`${field} mt-1`} value={String(selectedAudio.duck)} onChange={e=>setAudioTrackClipDuck(name,selectedAudio.id,Number(e.target.value))} data-testid="video-audio-clip-duck">
      {[0,0.25,0.5,0.75,0.9].map(v=><option key={v} value={v}>{v===0?t('video.audioDuckOff'):`${Math.round(v*100)}%`}</option>)}
     </NativeSelect>
    </label>
   </div>
   <p className="m-0 text-ink-3">{t('video.audioDuckHint')}</p>
   <div className="flex flex-wrap gap-2">
    <Button size="compact" variant="outline" onClick={()=>duplicateAudioTrackClip(name,selectedAudio.id)} data-testid="video-audio-clip-duplicate">{t('video.duplicateClip')}</Button>
    <Button size="compact" variant="ghost" onClick={()=>deleteAudioTrackClip(name,selectedAudio.id)} data-testid="video-audio-clip-delete">{t('video.deleteClip')}</Button>
   </div>
  </div>}
  <div className={row} data-testid="video-format">
   <span className="text-ink">{t('video.format')}</span>
   <label className="flex items-center gap-2"><NativeInput type="radio" name="video-format" className={check} checked={s.format==='webm'} disabled={webmDisabled} onChange={()=>setVideoFormat(name,'webm')} data-testid="video-format-webm"/>{t('video.format.webm')}</label>
   <label className="flex items-center gap-2"><NativeInput type="radio" name="video-format" className={check} checked={s.format==='mp4'} disabled={mp4Disabled} onChange={()=>setVideoFormat(name,'mp4')} data-testid="video-format-mp4"/>{mp4Silent?t('video.format.mp4NoAudio'):t('video.format.mp4')}</label>
   {webmDisabled&&mp4Disabled&&<p className="m-0 text-ink-3">{t('video.format.unavailable')}</p>}
   <div className="grid grid-cols-2 gap-2">
    <label>{t('video.exportScale')}
     <NativeSelect className={`${field} mt-1`} value={String(s.exportOptions.scale)} onChange={e=>setVideoExportOptions(name,{scale:Number(e.target.value)})} data-testid="video-export-scale">
      {[1,0.5,0.25].map(sc=><option key={sc} value={sc}>{sc===1?t('video.exportScaleOriginal'):`${Math.round(sc*100)}%`}{v?` · ${Math.max(2,Math.round(v.width*sc/2)*2)}×${Math.max(2,Math.round(v.height*sc/2)*2)}`:''}</option>)}
     </NativeSelect>
    </label>
    <label>{t('video.exportQuality')}
     <NativeSelect className={`${field} mt-1`} value={s.exportOptions.quality} onChange={e=>setVideoExportOptions(name,{quality:e.target.value as 'high'|'medium'|'low'})} data-testid="video-export-quality">
      {(['high','medium','low'] as const).map(q=><option key={q} value={q}>{t(`video.exportQuality.${q}`)}</option>)}
     </NativeSelect>
    </label>
    <label>{t('video.exportAspect')}
     <NativeSelect className={`${field} mt-1`} value={s.exportOptions.aspect} onChange={e=>setVideoExportOptions(name,{aspect:e.target.value as 'source'|'16:9'|'9:16'|'1:1'|'4:5'})} data-testid="video-export-aspect">
      {(['source','16:9','9:16','1:1','4:5'] as const).map(a=><option key={a} value={a}>{a==='source'?t('video.exportAspectSource'):a}</option>)}
     </NativeSelect>
    </label>
    <label>{t('video.exportFps')}
     <NativeSelect className={`${field} mt-1`} value={String(s.exportOptions.fps??0)} onChange={e=>setVideoExportOptions(name,{fps:Number(e.target.value)||null})} data-testid="video-export-fps">
      {[0,24,25,30,50,60].map(f=><option key={f} value={f}>{f===0?t('video.exportFpsSource'):t('video.exportFpsCap',{fps:f})}</option>)}
     </NativeSelect>
    </label>
   </div>
   <div className="grid grid-cols-2 gap-2">
    <label>{t('video.exportRangeFrom')}
     <NativeInput type="number" className={`${field} mt-1`} min={0} max={timelineDuration(s.clips)} step={0.1} value={s.exportRange?.start??0} onChange={e=>setVideoExportRange(name,{start:Number(e.target.value),end:s.exportRange?.end??timelineDuration(s.clips)})} data-testid="video-export-from"/>
    </label>
    <label>{t('video.exportRangeTo')}
     <NativeInput type="number" className={`${field} mt-1`} min={0} max={timelineDuration(s.clips)} step={0.1} value={s.exportRange?.end??timelineDuration(s.clips)} onChange={e=>setVideoExportRange(name,{start:s.exportRange?.start??0,end:Number(e.target.value)})} data-testid="video-export-to"/>
    </label>
   </div>
   {s.exportRange&&<p className="m-0 text-ink-3" data-testid="video-export-range-note">{t('video.exportRangeActive',{start:s.exportRange.start.toFixed(2),end:s.exportRange.end.toFixed(2)})}</p>}
   {s.status==='exporting'?<div className="flex items-center gap-2"><progress className="h-1.5 w-full accent-[var(--accent)]" max={1} value={s.progress?.ratio}/><Button size="compact" variant="ghost" onClick={()=>cancelVideoExport(name)}>{t('video.cancel')}</Button></div>:null}
   {s.result&&<p className="m-0 text-ink-3" data-testid="video-result-inspector">{t('video.result',{duration:s.result.report.duration_s.toFixed(2),bytes:String((s.result.report.bytes/1024).toFixed(0))+' KB',video:s.result.report.videoCodec??'',audio:s.result.report.audioCodec?` + ${s.result.report.audioCodec}`:t('video.resultAudioMuted')})}</p>}
  </div>
  <div className={row}>
   <Button size="compact" className="justify-self-start" onClick={()=>resetTimeline(name)} data-testid="video-reset">{t('video.reset')}</Button>
   <p className="m-0 text-ink-3">{t('video.note')}</p>
  </div>
 </fieldset>;
}
/** Right-panel host: the settings of the active video tab. */
export function VideoInspector(){
 const media=useMedia();const item=media.items.find(i=>i.name===media.active);
 if(item?.kind!=='video'&&item?.kind!=='video-project')return null;
 return <VideoControls key={item.name} name={item.name}/>;
}
