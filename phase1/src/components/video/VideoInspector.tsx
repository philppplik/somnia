import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {useMedia} from '../../lib/media';
import {cancelVideoExport,clearVideoTrim,resetVideoRecipe,updateVideoRecipe,useVideoSession} from '../../lib/video/session';
const row='grid gap-1.5 border-b border-subtle px-3 py-3 text-xs text-ink-2';
const check='!size-4 !w-4 shrink-0 accent-[var(--accent)]';
const field='h-7 w-full rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
/** Facts, trim, audio and export settings of the active clip. Playback and the export button live in the workspace. */
export function VideoControls({name}:{name:string}){
 const {t}=useT();const s=useVideoSession(name);
 if(!s)return <p className="p-3 text-xs text-ink-3">{t('video.loading')}</p>;
 const ready=s.status==='ready'||s.status==='exporting';
 const p=s.probe,v=p?.video,a=p?.audio,dur=p?.duration??0,trim=s.recipe.trim;
 const caps=s.capabilities;
 const mp4Silent=!!caps&&caps.mp4Video!==null&&!caps.aac;
 const mp4Disabled=!caps||caps.mp4Video===null;
 const webmDisabled=!caps||caps.webmVideo===null;
 const channels=a?(a.channels===1?t('video.mono'):a.channels===2?t('video.stereo'):t('video.channelsN',{count:a.channels})):'';
 return <fieldset disabled={!ready} className="m-0 min-w-0 border-0 p-0" data-testid="video-controls">
  <div className={row} data-testid="video-facts">
   <span className="text-ink">{t('video.facts')}</span>
   {v&&<span className="text-ink-3">{t('video.info',{duration:dur.toFixed(2),width:v.width,height:v.height,codec:v.codec??'?'})}{v.fps?` · ${t('video.infoFps',{fps:v.fps})}`:''}</span>}
   <span className="text-ink-3" data-testid="video-facts-audio">{a?t('video.audioInfo',{codec:a.codec??'?',channels,rate:a.rate}):t('video.noAudio')}</span>
  </div>
  <div className={row} data-testid="video-trim">
   <span className="text-ink">{t('video.trim')}</span>
   <div className="grid grid-cols-2 gap-2">
    <label>{t('video.trimStart')}<input type="number" className={`${field} mt-1`} min={0} max={dur} step={0.01} value={trim?trim.start_s:''} onChange={e=>updateVideoRecipe(name,r=>({...r,trim:{start_s:Number(e.target.value),end_s:r.trim?.end_s??dur}}))} data-testid="video-trim-start-input"/></label>
    <label>{t('video.trimEnd')}<input type="number" className={`${field} mt-1`} min={0} max={dur} step={0.01} value={trim?trim.end_s:''} onChange={e=>updateVideoRecipe(name,r=>({...r,trim:{start_s:r.trim?.start_s??0,end_s:Number(e.target.value)}}))} data-testid="video-trim-end-input"/></label>
   </div>
   <p className="m-0 text-ink-3">{trim?t('video.trimActive',{start:trim.start_s.toFixed(2),end:trim.end_s.toFixed(2),length:(trim.end_s-trim.start_s).toFixed(2)}):t('video.trimHint')}</p>
   {trim&&<Button size="compact" className="justify-self-start" onClick={()=>clearVideoTrim(name)} data-testid="video-trim-clear">{t('video.trimClear')}</Button>}
  </div>
  <div className={row} data-testid="video-audio">
   <span className="text-ink">{t('video.audio')}</span>
   <label className="flex items-center gap-2"><input type="checkbox" className={check} checked={s.recipe.audio==='mute'} disabled={!a} onChange={e=>updateVideoRecipe(name,r=>({...r,audio:e.target.checked?'mute':'auto'}))} data-testid="video-mute-export"/>{t('video.audioMute')}</label>
  </div>
  <div className={row} data-testid="video-format">
   <span className="text-ink">{t('video.format')}</span>
   <label className="flex items-center gap-2"><input type="radio" name="video-format" className={check} checked={s.recipe.format==='webm'} disabled={webmDisabled} onChange={()=>updateVideoRecipe(name,r=>({...r,format:'webm'}))} data-testid="video-format-webm"/>{t('video.format.webm')}</label>
   <label className="flex items-center gap-2"><input type="radio" name="video-format" className={check} checked={s.recipe.format==='mp4'} disabled={mp4Disabled} onChange={()=>updateVideoRecipe(name,r=>({...r,format:'mp4'}))} data-testid="video-format-mp4"/>{mp4Silent?t('video.format.mp4NoAudio'):t('video.format.mp4')}</label>
   {webmDisabled&&mp4Disabled&&<p className="m-0 text-ink-3">{t('video.format.unavailable')}</p>}
   {s.status==='exporting'?<div className="flex items-center gap-2"><progress className="h-1.5 w-full accent-[var(--accent)]" max={1} value={s.progress?.ratio}/><Button size="compact" variant="ghost" onClick={()=>cancelVideoExport(name)}>{t('video.cancel')}</Button></div>:null}
   {s.result&&<p className="m-0 text-ink-3">{t('video.result',{duration:s.result.report.duration_s.toFixed(2),bytes:String((s.result.report.bytes/1024).toFixed(0))+' KB',video:s.result.report.videoCodec??'',audio:s.result.report.audioCodec?` + ${s.result.report.audioCodec}`:t('video.resultAudioMuted')})}</p>}
  </div>
  <div className={row}>
   <Button size="compact" className="justify-self-start" onClick={()=>resetVideoRecipe(name)} data-testid="video-reset">{t('video.reset')}</Button>
   <p className="m-0 text-ink-3">{t('video.note')}</p>
  </div>
 </fieldset>;
}
/** Right-panel host: the settings of the active video tab. */
export function VideoInspector(){
 const media=useMedia();const item=media.items.find(i=>i.name===media.active);
 if(item?.kind!=='video')return null;
 return <VideoControls key={item.name} name={item.name}/>;
}
