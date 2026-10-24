import {useT} from '../../../lib/useT';
import {usePanelState} from '../../../store/panelStateStore';
import {HSL_BANDS,HSL_SWATCH,NEUTRAL_BAND,bandNeutral,type HslBand,type HslBandId} from '../../../lib/photos/hslMixer';
import {beginPhotoGesture,endPhotoGesture,previewPhotoSettings,commitPhotoSettings,type PhotoSession} from '../../../lib/photos/studioSession';
import {Button} from '../../ui/button';
import {NativeInput} from '../../ui/native-controls';
import {RotateCcw,Crosshair} from '../../../lib/icons';
import {PanelBody,SectionHead,isBusy} from './shared';

const SLIDERS:readonly {key:keyof HslBand;labelKey:string}[]=[{key:'hue',labelKey:'photos.p.hsl.hue'},{key:'sat',labelKey:'photos.p.hsl.sat'},{key:'lum',labelKey:'photos.p.hsl.lum'}];
const signed=(v:number)=>`${v>0?'+':''}${Math.round(v)}`;

function BandSlider({name,session,band,slider,disabled}:{name:string;session:PhotoSession;band:HslBandId;slider:keyof HslBand;disabled:boolean}){
 const {t}=useT();
 const value=session.now.hsl?.[band]?.[slider]??0;
 const label=t(`photos.p.hsl.${slider}`);
 const end=()=>endPhotoGesture(name);
 const set=(v:number)=>previewPhotoSettings(name,s=>({...s,hsl:{...s.hsl,[band]:{...(s.hsl?.[band]??NEUTRAL_BAND),[slider]:v}}}));
 return <label className="grid gap-1">
  <span className="flex items-center justify-between gap-2">
   <span className={value!==0?'text-ink':''} onDoubleClick={()=>commitPhotoSettings(name,s=>({...s,hsl:{...s.hsl,[band]:{...(s.hsl?.[band]??NEUTRAL_BAND),[slider]:0}}}))} title={t('photos.p.dblReset')}>{label}{value!==0&&<span aria-hidden="true" className="ml-1 text-[var(--accent)]">•</span>}</span>
   <span className="shrink-0 tabular-nums text-ink-3" data-testid={`photos-hsl-value-${slider}`}>{signed(value)}</span>
  </span>
  <NativeInput type="range" className="w-full accent-[var(--accent)]" min={-100} max={100} step={1} value={value} disabled={disabled}
   aria-label={`${t(`photos.p.hsl.band.${band}`)} ${label}`} aria-valuetext={signed(value)} data-testid={`photos-hsl-slider-${slider}`}
   onPointerDown={()=>beginPhotoGesture(name)} onChange={e=>{beginPhotoGesture(name);set(Number(e.target.value));}} onPointerUp={end} onBlur={end} onKeyUp={end}/>
 </label>;
}

/** HSL color mixer: eight hue bands with hue, saturation and luminance sliders each. One slider drag is one undo step. */
export function HslPanel(){
 const {t}=useT();
 const [band,setBand]=usePanelState<HslBandId>('photos.hsl','red');
 const [target,setTarget]=usePanelState<boolean>('photos.hsl.target',false);
 const [,setCurvesTarget]=usePanelState<boolean>('photos.curves.target',false);
 const active=HSL_BANDS.includes(band)?band:'red';
 return <PanelBody testId="photos-hsl-panel">{({name,session})=>{
  const busy=isBusy(session);const current=session.now.hsl?.[active]??NEUTRAL_BAND;
  return <fieldset disabled={busy} className="m-0 grid min-w-0 gap-3 border-0 p-0">
   <SectionHead>
    <Button size="tiny" variant="outline" aria-pressed={target} title={t('photos.p.target.hsl')} aria-label={t('photos.p.target.hsl')} onClick={()=>{const v=!target;setTarget(v);if(v)setCurvesTarget(false);}} data-testid="photos-hsl-target"><Crosshair size={12}/></Button>
    {session.status==='processing'&&<span className="text-ink-3" role="status">{t('photos.processing')}</span>}
    <Button size="tiny" variant="outline" disabled={bandNeutral(current)} onClick={()=>commitPhotoSettings(name,s=>({...s,hsl:{...s.hsl,[active]:{...NEUTRAL_BAND}}}))} data-testid="photos-hsl-reset" aria-label={t('photos.p.hsl.resetBand',{band:t(`photos.p.hsl.band.${active}`)})}><RotateCcw size={11}/>{t('photos.p.reset')}</Button>
   </SectionHead>
   <div className="flex flex-wrap gap-1" role="group" aria-label={t('photos.p.hsl.bands')}>
    {HSL_BANDS.map(b=><Button key={b} size="tiny" variant="outline" aria-pressed={active===b} onClick={()=>setBand(b)} data-testid={`photos-hsl-band-${b}`}>
     <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><circle cx="4.5" cy="4.5" r="4" fill={HSL_SWATCH[b]}/></svg>
     {t(`photos.p.hsl.band.${b}`)}
    </Button>)}
   </div>
   {SLIDERS.map(s=><BandSlider key={s.key} name={name} session={session} band={active} slider={s.key} disabled={busy}/>)}
   <p className="m-0 text-ink-3">{t('photos.p.hsl.hint')}</p>
  </fieldset>;
 }}</PanelBody>;
}
