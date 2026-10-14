import {useEffect,type ReactNode} from 'react';
import {useMedia} from '../../../lib/media';
import {useT} from '../../../lib/useT';
import {reportError} from '../../../lib/log';
import {commandDispatcher} from '../../../lib/commandDispatcher';
import {beginPhotoGesture,endPhotoGesture,previewPhotoSettings,usePhotoSession,type PhotoSession} from '../../../lib/photos/studioSession';
import {neutralPhotoSettings,type PhotoControl} from '../../../lib/photos/studioSettings';
import {registerPhotosCommands} from '../../../lib/photos/panelCommands';
import {registerRailIcons} from '../../../lib/shell/railIcons';
import {AudioWaveform,Layers,Download,Spline,Palette} from '../../../lib/icons';
import {NativeInput} from '../../ui/native-controls';
/** Rail icons for the panels shellRail.ts does not cover (first registration wins, History/Info/Develop* come from shellRail). */
registerRailIcons({Histogram:AudioWaveform,Presets:Layers,Download,Curves:Spline,Palette});

/** The photo the Photos studio shows, plus its develop session (null while nothing is open or developable). */
export function useActivePhoto(){
 const media=useMedia();const item=media.items.find(i=>i.name===media.active);
 const session=usePhotoSession(item?.name);
 return {item,session,name:item?.name??null};
}
/** Panels register the shared command specs while mounted (the canvas does too; registration is reference counted). */
export function usePhotosCommands(){useEffect(()=>registerPhotosCommands(),[]);}
/** Runs a Photos command through the shared dispatcher (validated, logged, refused for agent origins). */
export function runPhotos(id:string,params?:unknown):Promise<unknown>{
 return commandDispatcher.runCommand(id,params,{origin:'ui'}).catch(e=>{reportError('photos.panel',e,{message:id});});
}
export const isBusy=(s:PhotoSession|null)=>!s||s.status==='loading'||s.status==='error';

const body='grid content-start gap-3 px-3 py-3 text-xs text-ink-2';
/** The shell stack gives every panel a box of its own; content that is taller scrolls inside it instead of spilling over the next panel. */
const scroll='h-full min-h-0 overflow-y-auto';
/** Wraps panel content: command registration, empty and error states, consistent padding. */
export function PanelBody({children,testId,needsReady=true}:{children:(a:{name:string;session:PhotoSession})=>ReactNode;testId:string;needsReady?:boolean}){
 const {t}=useT();const {name,session}=useActivePhoto();usePhotosCommands();
 if(!name||!session)return <div className={scroll}><p className="m-0 px-3 py-3 text-xs text-ink-3" data-testid={`${testId}-empty`}>{t('photos.p.empty')}</p></div>;
 if(session.status==='error')return <div className={scroll}><p className="m-0 px-3 py-3 text-xs" style={{color:'var(--danger)'}} role="alert" data-testid={`${testId}-error`}>{t('photos.error',{message:session.error})}</p></div>;
 if(needsReady&&session.status==='loading')return <div className={scroll}><p className="m-0 px-3 py-3 text-xs text-ink-3" data-testid={`${testId}-loading`}>{t('photos.loading')}</p></div>;
 return <div className={scroll}><div className={body} data-testid={testId}>{children({name,session})}</div></div>;
}
/** Row of controls (reset, undo, channel buttons). The panel title itself is drawn by the shell stack, so it is not repeated here. `title` is for sub-headings. */
export function SectionHead({title,children}:{title?:string;children?:ReactNode}){
 return <div className={`flex items-center gap-2 ${title?'justify-between':'justify-end'}`}>{title&&<span className="font-medium text-ink">{title}</span>}<span className="flex flex-wrap items-center justify-end gap-1">{children}</span></div>;
}
const signed=(v:number)=>`${v>0?'+':''}${Math.round(v*100)/100}`;
/**
 * One slider row. Dragging is one undo step (session gesture API, like the Develop inspector).
 * Double-click on the label resets that control through the `photos.setAdjustment` command. Test ids match the old Develop inspector.
 */
export function SettingSlider({name,session,control,disabled}:{name:string;session:PhotoSession;control:PhotoControl;disabled:boolean}){
 const {t}=useT();const value=session.now[control.key];
 if(typeof value!=='number')return null;
 const neutral=neutralPhotoSettings[control.key] as number;const changed=value!==neutral;const label=t(control.label);
 const end=()=>endPhotoGesture(name);
 return <label className="grid gap-1">
  <span className="flex items-center justify-between gap-2">
   <span className={changed?'text-ink':''} onDoubleClick={()=>void runPhotos('photos.setAdjustment',{key:control.key,value:neutral})} title={t('photos.p.dblReset')}>{label}{changed&&<span aria-hidden="true" className="ml-1 text-[var(--accent)]">•</span>}</span>
   <span className="shrink-0 tabular-nums text-ink-3" data-testid={`photos-value-${control.key}`}>{control.format?control.format(value):value}</span>
  </span>
  <NativeInput type="range" className="w-full accent-[var(--accent)]" min={control.min} max={control.max} step={control.step} value={value} disabled={disabled}
   aria-label={label} aria-valuetext={control.format?control.format(value):signed(value)} data-testid={`photos-slider-${control.key}`}
   onPointerDown={()=>beginPhotoGesture(name)} onChange={e=>{beginPhotoGesture(name);previewPhotoSettings(name,s=>({...s,[control.key]:Number(e.target.value)}));}} onPointerUp={end} onBlur={end} onKeyUp={end}/>
 </label>;
}
