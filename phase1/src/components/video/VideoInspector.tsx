import {useMemo,useState} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {useMedia} from '../../lib/media';
import {addTimelineClip,addTimelineClipsFromDialog,cancelVideoExport,deleteTimelineClip,moveTimelineClip,resetTimeline,setTimelineClipGain,setVideoFormat,selectTimelineClip,toggleTimelineClipMute,trimTimelineClip,useVideoSession} from '../../lib/video/session';
import {MAX_GAIN,timelineDuration} from '../../lib/video/timeline';
const row='grid gap-1.5 border-b border-subtle px-3 py-3 text-xs text-ink-2';
const check='!size-4 !w-4 shrink-0 accent-[var(--accent)]';
const field='h-7 w-full rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
/** Facts, timeline, selected-clip and export settings of the active video project. Playback lives in the workspace. */
export function VideoControls({name}:{name:string}){
 const {t}=useT();const s=useVideoSession(name);
 const media=useMedia();
 const [addPick,setAddPick]=useState('');
 const candidates=useMemo(()=>media.items.filter(i=>i.kind==='video'),[media.items]);
 if(!s)return <p className="p-3 text-xs text-ink-3">{t('video.loading')}</p>;
 const ready=s.status==='ready'||s.status==='exporting';
 const p=s.probe,v=p?.video,a=p?.audio,dur=p?.duration??0;
 const caps=s.capabilities;
 const mp4Silent=!!caps&&caps.mp4Video!==null&&!caps.aac;
 const mp4Disabled=!caps||caps.mp4Video===null;
 const webmDisabled=!caps||caps.webmVideo===null;
 const channels=a?(a.channels===1?t('video.mono'):a.channels===2?t('video.stereo'):t('video.channelsN',{count:a.channels})):'';
 const selected=s.clips.find(c=>c.id===s.selectedClipId)??null;
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
    <select className={field} value={addPick} onChange={e=>setAddPick(e.target.value)} aria-label={t('video.addClipPick')} data-testid="video-add-pick">
     <option value="">{t('video.addClipPick')}</option>
     {candidates.map(i=><option key={i.name} value={i.name}>{i.name}</option>)}
    </select>
    <Button size="compact" disabled={!addPick} onClick={()=>{const item=candidates.find(i=>i.name===addPick);if(item)void addTimelineClip(name,item);setAddPick('');}} data-testid="video-add-clip">{t('video.addClip')}</Button>
    <Button size="compact" variant="outline" onClick={()=>void addTimelineClipsFromDialog(name)} data-testid="video-add-open">{t('video.addOpen')}</Button>
   </div>
   <p className="m-0 text-ink-3">{t('video.timelineHint')}</p>
  </div>
  {selected&&<div className={row} data-testid="video-clip-panel">
   <span className="text-ink">{t('video.clipTitle',{index:selectedIndex+1})}</span>
   <span className="truncate text-ink-3" data-testid="video-clip-source">{selected.source}</span>
   <div className="grid grid-cols-2 gap-2">
    <label>{t('video.trimStart')}<input type="number" className={`${field} mt-1`} min={0} step={0.01} value={selected.in_s} onChange={e=>trimTimelineClip(name,selected.id,'in',Number(e.target.value))} data-testid="video-clip-in-input"/></label>
    <label>{t('video.trimEnd')}<input type="number" className={`${field} mt-1`} min={0} step={0.01} value={selected.out_s} onChange={e=>trimTimelineClip(name,selected.id,'out',Number(e.target.value))} data-testid="video-clip-out-input"/></label>
   </div>
   <label className="grid gap-1">{t('video.gain',{percent:Math.round(selected.gain*100)})}
    <input type="range" className="accent-[var(--accent)]" min={0} max={MAX_GAIN} step={0.05} value={selected.gain} onChange={e=>setTimelineClipGain(name,selected.id,Number(e.target.value))} data-testid="video-clip-gain"/>
   </label>
   <label className="flex items-center gap-2"><input type="checkbox" className={check} checked={selected.muted} onChange={()=>toggleTimelineClipMute(name,selected.id)} data-testid="video-clip-mute"/>{t('video.clipMute')}</label>
   <div className="flex flex-wrap gap-2">
    <Button size="compact" variant="outline" disabled={selectedIndex<=0} onClick={()=>moveTimelineClip(name,selected.id,-1)} data-testid="video-clip-left">{t('video.moveLeft')}</Button>
    <Button size="compact" variant="outline" disabled={selectedIndex<0||selectedIndex>=s.clips.length-1} onClick={()=>moveTimelineClip(name,selected.id,1)} data-testid="video-clip-right">{t('video.moveRight')}</Button>
    <Button size="compact" variant="ghost" disabled={s.clips.length<=1&&media.items.find(i=>i.name===name)?.kind!=='video-project'} onClick={()=>{deleteTimelineClip(name,selected.id);selectTimelineClip(name,null);}} data-testid="video-clip-delete">{t('video.deleteClip')}</Button>
   </div>
   <p className="m-0 text-ink-3">{t('video.clipHint')}</p>
  </div>}
  <div className={row} data-testid="video-format">
   <span className="text-ink">{t('video.format')}</span>
   <label className="flex items-center gap-2"><input type="radio" name="video-format" className={check} checked={s.format==='webm'} disabled={webmDisabled} onChange={()=>setVideoFormat(name,'webm')} data-testid="video-format-webm"/>{t('video.format.webm')}</label>
   <label className="flex items-center gap-2"><input type="radio" name="video-format" className={check} checked={s.format==='mp4'} disabled={mp4Disabled} onChange={()=>setVideoFormat(name,'mp4')} data-testid="video-format-mp4"/>{mp4Silent?t('video.format.mp4NoAudio'):t('video.format.mp4')}</label>
   {webmDisabled&&mp4Disabled&&<p className="m-0 text-ink-3">{t('video.format.unavailable')}</p>}
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
