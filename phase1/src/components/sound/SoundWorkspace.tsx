import {useCallback,useEffect,useRef,useState} from 'react';
import {Pause,Play,Download} from '../../lib/icons';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {downloadSound,openSound,setSoundListen,useSoundSession} from '../../lib/sound/session';
import {isNeutral} from '../../lib/sound/recipe';
import {getState,patchState,requestStudio,useAppStore} from '../../store/appStore';
import {Waveform} from './Waveform';
import {SoundControls} from './SoundInspector';
import type {MediaItem} from '../../lib/media';
const bar='media-bar flex items-center gap-2 border-b border-subtle px-3 py-1.5 text-[12px]';
const fmt=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}.${Math.floor((s%1)*10)}`;
/** Waveform, A/B listening, transport and export for one opened audio file. `withPanel` adds the settings when the Sound inspector is not on screen. */
export function SoundWorkspace({item,withPanel=false}:{item:MediaItem;withPanel?:boolean}){
 const {t}=useT();const studio=useAppStore().activeStudio;const session=useSoundSession(item.name);
 const audio=useRef<HTMLAudioElement>(null);const [time,setTime]=useState(0),[playing,setPlaying]=useState(false);
 useEffect(()=>{void openSound(item);},[item]);
 // Opening audio takes you to the Sound Studio unless you picked a studio yourself.
 useEffect(()=>{if(studio!=='sound')requestStudio('sound','automatic');},[studio]);
 // The Sound rail offers Files only, so do not leave the HTML Layers tree open beside audio.
 useEffect(()=>{if(studio==='sound'&&!['files','search'].includes(getState().leftTab))patchState({leftTab:'files'});},[studio]);
 const shown=session?.listen==='original'?session.original:session?.processed??null;
 const url=shown?.url;
 // Switching version or re-rendering keeps position and play state.
 useEffect(()=>{
  const el=audio.current;if(!el||!url)return;const at=el.currentTime,was=!el.paused;
  el.src=url;el.load();const onMeta=()=>{el.currentTime=Math.min(at,el.duration||at);if(was)void el.play().catch(()=>{});};
  el.addEventListener('loadedmetadata',onMeta,{once:true});return()=>el.removeEventListener('loadedmetadata',onMeta);
 },[url]);
 const toggle=useCallback(()=>{const el=audio.current;if(!el||!el.src)return;if(el.paused)void el.play().catch(()=>{});else el.pause();},[]);
 const seek=useCallback((s:number)=>{const el=audio.current;if(!el)return;el.currentTime=Math.min(s,el.duration||s);setTime(el.currentTime);},[]);
 const duration=shown?.report.output.duration_s??0;
 const onKey=(e:React.KeyboardEvent)=>{
  const el=audio.current;if(!el)return;const step=e.shiftKey?5:1;
  if(e.key===' '){e.preventDefault();toggle();}
  else if(e.key==='ArrowRight'){e.preventDefault();seek(el.currentTime+step);}
  else if(e.key==='ArrowLeft'){e.preventDefault();seek(Math.max(0,el.currentTime-step));}
  else if(e.key==='Home'){e.preventDefault();seek(0);}
  else if(e.key==='End'){e.preventDefault();seek(duration);}
 };
 const status=!session||session.status==='loading'?t('sound.loading'):session.status==='processing'?t('sound.processing'):session.status==='error'?t('sound.error',{message:session.error}):'';
 const info=session?.original?.report.input;const edited=!!session&&!isNeutral(session.settings);
 const channels=info?(info.channels===1?t('sound.mono'):info.channels===2?t('sound.stereo'):t('sound.channelsN',{count:info.channels})):'';
 const out=session?.processed?.report;
 return <section className="canvas-stage flex min-h-0 w-full flex-1 flex-col" aria-label={t('sound.title')} data-testid="sound-workspace">
  <div className={bar}>
   <span className="truncate font-medium text-ink" data-testid="sound-name">{item.name}</span>
   <span className="text-ink-3" data-testid="sound-info">{info?t('sound.info',{duration:info.duration_s.toFixed(2),rate:info.sample_rate,channels}):''}</span>
   <span className="flex-1"/>
   <div role="radiogroup" aria-label={t('sound.listen')} className="flex gap-1 rounded-[var(--r-control)] bg-hover p-0.5">
    {(['original','processed'] as const).map(k=><Button key={k} role="radio" size="compact" aria-checked={(session?.listen??'processed')===k} aria-label={t(k==='original'?'sound.original':'sound.edited')} disabled={!session?.original||(k==='processed'&&!edited)} onClick={()=>setSoundListen(item.name,k)}>{t(k==='original'?'sound.original':'sound.edited')}</Button>)}
   </div>
   <Button size="compact" aria-label={t('sound.export')} title={t('sound.exportHint')} disabled={!session?.processed} onClick={()=>downloadSound(item.name)} data-testid="sound-export"><Download size={13}/>{t('sound.export')}</Button>
  </div>
  <div className="flex min-h-0 w-full flex-1">
   <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
    <div className="min-h-0 w-full flex-1">
     <Waveform original={session?.original?.peaks??null} processed={edited?session?.processed?.peaks??null:session?.original?.peaks??null} originalSeconds={info?.duration_s??0} processedSeconds={out?.output.duration_s??info?.duration_s??0} position={time} duration={duration} label={t('sound.waveform',{name:item.name})} onSeek={seek} onKey={onKey}/>
    </div>
    <div className="flex items-center gap-3 text-[12px] text-ink-2">
     <Button size="icon" variant="outline" aria-label={t(playing?'sound.pause':'sound.play')} aria-pressed={playing} disabled={!shown} onClick={toggle} data-testid="sound-play">{playing?<Pause size={16}/>:<Play size={16}/>}</Button>
     <span className="tabular-nums" data-testid="sound-time">{fmt(time)} / {fmt(duration)}</span>
     <span className="flex-1 truncate text-ink-3" data-testid="sound-result">{edited&&out&&session.status==='ready'?t('sound.result',{duration:out.output.duration_s.toFixed(2),peak:out.output.peak_db.toFixed(1),steps:out.steps.length}):''}</span>
     <span role="status" aria-live="polite" className="text-ink-3" style={session?.status==='error'?{color:'var(--danger)'}:undefined} data-testid="sound-status">{status}</span>
    </div>
   </div>
   {withPanel&&<aside className="w-[260px] shrink-0 overflow-auto border-l border-subtle" aria-label={t('sound.panel')}><SoundControls name={item.name}/></aside>}
  </div>
  <audio ref={audio} preload="auto" className="hidden" onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);setTime(0);}}/>
 </section>;
}
