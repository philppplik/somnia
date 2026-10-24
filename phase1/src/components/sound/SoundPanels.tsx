import {useMedia,formatBytes} from '../../lib/media';
import {useSoundSession,isSoundExportReady} from '../../lib/sound/session';
import {activeSoundName} from '../../lib/sound/commands';
import {executeCommand} from '../../lib/commands';
import {useT} from '../../lib/useT';
import {usePanelState} from '../../store/panelStateStore';
import type {PanelHostProps,InspectorSectionProps} from '../../lib/shell/types';
import {SoundControls} from './SoundInspector';
import {Button} from '../ui/button';
import {Input} from '../ui/input';
export function ClipsPanel({panelId,context}:PanelHostProps){
 const {t}=useT(),m=useMedia();const [filter,setFilter]=usePanelState<string>(`${context.studio}.${panelId}.filter`,'');
 const clips=m.items.filter(i=>i.kind==='audio'&&i.name.toLowerCase().includes(filter.toLowerCase()));
 return <div className="grid gap-2 p-3" data-testid="sound-clips-panel">
  <Input value={filter} onChange={e=>setFilter(e.target.value)} placeholder={t('sound.shell.filter')} aria-label={t('sound.shell.filter')}/>
  {!clips.length&&<p className="text-xs text-ink-3">{t('sound.shell.noClips')}</p>}
  <ul className="m-0 grid list-none gap-1 p-0">{clips.map(i=><li key={i.name}><button type="button" className={'w-full rounded-sm p-2 text-left text-xs hover:bg-hover '+(m.active===i.name?'bg-accent-soft text-accent':'text-ink-2')} aria-current={m.active===i.name?'true':undefined} onClick={()=>void executeCommand('sound.clip.activate',{name:i.name})}><span className="block truncate">{i.name}</span><span className="text-ink-3">{formatBytes(i.size)}</span></button></li>)}</ul>
 </div>;
}
function Controls({group}:{group:'selection'|'effects'|'levels'|'summary'}){useMedia();const name=activeSoundName(),{t}=useT();return name?<SoundControls name={name} group={group}/>:<p className="p-3 text-xs text-ink-3">{t('sound.start.title')}</p>;}
export function SelectionPanel(_:PanelHostProps){const {t}=useT();useMedia();const s=useSoundSession(activeSoundName());return <div data-testid="sound-selection-panel"><div className="p-3 pb-0"><Button size="compact" disabled={!s?.original||!!s.settings.region} onClick={()=>void executeCommand('sound.selection.all')}>{t('cmd.sound.selection.all')}</Button></div><Controls group="selection"/></div>;}
export function EffectsPanel(_:PanelHostProps){return <div data-testid="sound-effects-panel"><Controls group="effects"/></div>;}
export function LevelsSection(_:InspectorSectionProps){return <Controls group="levels"/>;}
export function ProcessingSection(_:InspectorSectionProps){const {t}=useT();useMedia();const s=useSoundSession(activeSoundName());return <div><Controls group="summary"/><div className="flex flex-wrap gap-1 px-3 pb-3">{(['original','processed'] as const).map(version=><Button key={version} size="compact" aria-pressed={s?.listen===version} disabled={!s?.original} onClick={()=>void executeCommand('sound.listen',{version})}>{t(version==='original'?'sound.original':'sound.edited')}</Button>)}<Button size="compact" disabled={!isSoundExportReady(activeSoundName())} onClick={()=>void executeCommand('sound.export')}>{t('sound.export')}</Button></div></div>;}
export function SourceSection(_:InspectorSectionProps){
 const {t}=useT();useMedia();const s=useSoundSession(activeSoundName()),info=s?.original?.report.input;
 if(!info)return <p className="text-xs text-ink-3">{t(s?.status==='error'?'sound.error':s?'sound.loading':'sound.start.title',{message:s?.error??''})}</p>;
 const rows=[[t('sound.shell.duration'),`${info.duration_s.toFixed(2)} s`],[t('sound.shell.rate'),`${info.sample_rate} Hz`],[t('sound.shell.channels'),String(info.channels)],[t('sound.shell.peak'),`${info.peak_db.toFixed(1)} dB`],[t('sound.shell.rms'),`${info.rms_db.toFixed(1)} dB`],[t('sound.shell.output'),`${s!.processed?.report.output.duration_s.toFixed(2)??'0'} s`]];
 return <div className="grid gap-2 text-xs" data-testid="sound-source-section"><p className="m-0 truncate font-medium">{s!.name}</p><dl className="m-0 grid grid-cols-[1fr_auto] gap-2">{rows.map(([label,value])=><div key={label} className="contents"><dt className="text-ink-3">{label}</dt><dd className="m-0 tabular-nums">{value}</dd></div>)}</dl><p className="m-0 text-ink-3">{t('sound.note')}</p></div>;
}
