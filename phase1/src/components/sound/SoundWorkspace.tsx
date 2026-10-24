import {getSoundPlayback,subscribeSoundPlayback,toggleSoundPlayback,seekSound} from '../../lib/sound/transport';
import type {ContextStore} from '../../lib/shell/contextStore';
import {studioContextStore} from '../../lib/shell/studioContext';
import {registerSoundCommands,registerSoundTransport} from '../../lib/sound/commands';
import {executeCommand} from '../../lib/commands';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {reportError} from '../../lib/log';
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {Pause,Play,Download} from '../../lib/icons';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {stageKey} from '../../lib/sound/steps';
import {openSound,isSoundExportReady,useSoundSession} from '../../lib/sound/session';
import {isNeutral} from '../../lib/sound/recipe';
import {useAppStore} from '../../store/appStore';
import {Waveform} from './Waveform';
import {SoundControls} from './SoundInspector';
import type {MediaItem} from '../../lib/media';
const bar='media-bar flex items-center gap-2 border-b border-subtle px-3 py-1.5 text-[12px]';
const fmt=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}.${Math.floor((s%1)*10)}`;
/** Waveform, A/B listening, transport and export for one opened audio file. `withPanel` adds the settings when the Sound inspector is not on screen. */
export function SoundWorkspace({item,withPanel=false}:{item:MediaItem;withPanel?:boolean}){
 const {t}=useT();const studio=useAppStore().activeStudio;const session=useSoundSession(item.name);
 const {time,playing}=useSyncExternalStore(subscribeSoundPlayback,()=>getSoundPlayback(item.name),()=>getSoundPlayback(item.name));
 useEffect(()=>{void openSound(item);},[item]);
 const shown=session?.listen==='original'?session.original:session?.processed??null;
 const [note,setNote]=useState('');
 const doSave=async()=>{setNote('');try{const r=await commandDispatcher.runCommand('sound.export');if(r==='saved')setNote(t('sound.saved'));else if(r==='downloaded')setNote(t('sound.downloaded'));}catch(e){reportError('sound.operation',e,{context:{studio:'sound'}});setNote(t('sound.saveFailed',{message:e instanceof Error?e.message:String(e)}));}};
 const toggle=useCallback(()=>{void toggleSoundPlayback(item.name).catch(e=>reportError('sound.playback',e));},[item.name]);
 const seek=useCallback((seconds:number)=>seekSound(item.name,seconds),[item.name]);
 const duration=shown?.report.output.duration_s??0;
 useEffect(()=>registerSoundCommands(),[]);
 useEffect(()=>registerSoundTransport({name:item.name,toggle,seek}),[item.name,toggle,seek]);
 const contextOwner=useRef<ReturnType<ContextStore['claim']>|null>(null);
 useEffect(()=>{if(studio!=='sound')return;const owner=studioContextStore.claim('sound',{id:item.name,kind:'audio',dirty:false,readOnly:false});contextOwner.current=owner;return()=>{owner.release();if(contextOwner.current===owner)contextOwner.current=null;};},[studio,item.name]);
 useEffect(()=>{const selection=session?.selection;contextOwner.current?.report({document:{id:item.name,kind:'audio',dirty:!!session&&!isNeutral(session.settings),readOnly:false},selection:selection?{kind:'one',type:'audio-region',count:1,ids:[item.name+':region']}:{kind:'none',count:0,ids:[]},busy:session?.status==='loading'||session?.status==='processing',services:{ready:!!session?.original},data:{name:item.name,start:selection?.start??null,end:selection?.end??null,status:session?.status??'loading'}});},[studio,item.name,session]);
 const onKey=(e:React.KeyboardEvent)=>{
  const el={currentTime:time};const step=e.shiftKey?5:1;
  if(e.key===' '){e.preventDefault();void executeCommand('sound.transport.toggle');}
  else if(e.key==='ArrowRight'){e.preventDefault();seek(el.currentTime+step);}
  else if(e.key==='ArrowLeft'){e.preventDefault();seek(Math.max(0,el.currentTime-step));}
  else if(e.key==='i'||e.key==='o'){e.preventDefault();const sel=session?.selection,d=info?.duration_s??0;if(e.key==='i')void executeCommand('sound.selection.set',{start:el.currentTime,end:Math.max(sel?.end??d,el.currentTime+0.01)});else void executeCommand('sound.selection.set',{start:Math.min(sel?.start??0,el.currentTime-0.01),end:el.currentTime});}
  else if(e.key==='Escape')void executeCommand('sound.selection.clear');
  else if(e.key==='Home'){e.preventDefault();seek(0);}
  else if(e.key==='End'){e.preventDefault();seek(duration);}
 };
 const status=!session||session.status==='loading'?t('sound.loading'):session.status==='processing'?(session.progress?t('sound.processingStage',{stage:t(stageKey(session.progress.stage)),current:session.progress.index+1,total:session.progress.total}):t('sound.processing')):session.status==='error'?t('sound.error',{message:session.error}):'';
 const info=session?.original?.report.input;const edited=!!session&&!isNeutral(session.settings);
 const channels=info?(info.channels===1?t('sound.mono'):info.channels===2?t('sound.stereo'):t('sound.channelsN',{count:info.channels})):'';
 const out=session?.processed?.report;
 return <section className="canvas-stage flex min-h-0 w-full flex-1 flex-col" aria-label={t('sound.title')} data-testid="sound-workspace">
  <div className={bar}>
   <span className="truncate font-medium text-ink" data-testid="sound-name">{item.name}</span>
   <span className="text-ink-3" data-testid="sound-info">{info?t('sound.info',{duration:info.duration_s.toFixed(2),rate:info.sample_rate,channels}):''}</span>
   <span className="flex-1"/>
   <div role="radiogroup" aria-label={t('sound.listen')} className="flex gap-1 rounded-[var(--r-control)] bg-hover p-0.5">
    {(['original','processed'] as const).map(k=><Button key={k} role="radio" size="compact" aria-checked={(session?.listen??'processed')===k} aria-label={t(k==='original'?'sound.original':'sound.edited')} disabled={!session?.original||(k==='processed'&&!edited)} onClick={()=>void executeCommand('sound.listen',{version:k})}>{t(k==='original'?'sound.original':'sound.edited')}</Button>)}
   </div>
   <Button size="compact" aria-label={t('sound.export')} title={t('sound.exportHint')} disabled={!isSoundExportReady(item.name)} onClick={()=>void doSave()} data-testid="sound-export"><Download size={13}/>{t('sound.export')}</Button>
  </div>
  <div className="flex min-h-0 w-full flex-1">
   <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
    <div className="min-h-0 w-full flex-1">
     <Waveform original={session?.original?.peaks??null} processed={edited?session?.processed?.peaks??null:session?.original?.peaks??null} originalSeconds={info?.duration_s??0} processedSeconds={out?.output.duration_s??info?.duration_s??0} position={time} duration={duration} selection={session?.selection??null} region={session?.settings.region&&session.settings.region.mode==='only'?session.settings.region:null} selectable={!!session?.original&&(!session.settings.region||session.settings.region.mode==='only')} onSelect={r=>void executeCommand('sound.selection.set',r)} label={t('sound.waveform',{name:item.name})} onSeek={seconds=>void executeCommand('sound.transport.seek',{seconds})} onKey={onKey}/>
    </div>
    <div className="flex items-center gap-3 text-[12px] text-ink-2">
     <Button size="icon" variant="outline" aria-label={t(playing?'sound.pause':'sound.play')} aria-pressed={playing} disabled={!shown} onClick={()=>void executeCommand('sound.transport.toggle')} data-testid="sound-play">{playing?<Pause size={16}/>:<Play size={16}/>}</Button>
     <span className="tabular-nums" data-testid="sound-time">{fmt(time)} / {fmt(duration)}</span>
     <span className="flex-1 truncate text-ink-3" data-testid="sound-result">{edited&&out&&session.status==='ready'?t('sound.result',{duration:out.output.duration_s.toFixed(2),peak:out.output.peak_db.toFixed(1),steps:out.steps.length}):''}</span>
     <span className="text-ink-3" role="status" aria-live="polite" data-testid="sound-note">{note}</span>
     {session?.status==='processing'?<progress className="h-1.5 w-24 accent-[var(--accent)]" max={session.progress?.total??1} value={session.progress?session.progress.index:undefined} aria-label={t('sound.processing')} data-testid="sound-progress"/>:null}
     <span role="status" aria-live="polite" className="text-ink-3" style={session?.status==='error'?{color:'var(--danger)'}:undefined} data-testid="sound-status">{status}</span>
    </div>
   </div>
   {withPanel&&<aside className="w-[260px] shrink-0 overflow-auto border-l border-subtle" aria-label={t('sound.panel')}><SoundControls name={item.name}/></aside>}
  </div>
 </section>;
}
