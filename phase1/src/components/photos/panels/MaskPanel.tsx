import {useT} from '../../../lib/useT';
import {usePanelState} from '../../../store/panelStateStore';
import {LUM_ZONES,lumMaskNeutral,neutralLumMask,type LumMask} from '../../../lib/photos/lumMask';
import {beginPhotoGesture,endPhotoGesture,previewPhotoSettings,commitPhotoSettings,type PhotoSession} from '../../../lib/photos/studioSession';
import {Button} from '../../ui/button';
import {NativeInput} from '../../ui/native-controls';
import {Eye,RotateCcw} from '../../../lib/icons';
import {PanelBody,SectionHead,isBusy} from './shared';

const signed=(v:number)=>`${v>0?'+':''}${Math.round(v*100)/100}`;
type NumKey='lumaLo'|'lumaHi'|'feather'|'hueRange'|'ev'|'temp'|'sat'|'hueCenter';
function MaskSlider({name,session,control,disabled}:{name:string;session:PhotoSession;control:{key:NumKey;labelKey:string;min:number;max:number;step:number;fmt?:(v:number)=>string};disabled:boolean}){
 const {t}=useT();
 const m=session.now.lumMask??neutralLumMask();
 const value=(m[control.key] as number)??0;
 const label=t(control.labelKey);
 const end=()=>endPhotoGesture(name);
 const set=(v:number)=>previewPhotoSettings(name,s=>({...s,lumMask:{...(s.lumMask??neutralLumMask()),[control.key]:v}}));
 const fmt=control.fmt??signed;
 return <label className="grid gap-1">
  <span className="flex items-center justify-between gap-2">
   <span className="text-ink-2" title={t('photos.p.dblReset')}>{label}</span>
   <span className="shrink-0 tabular-nums text-ink-3" data-testid={`photos-mask-value-${control.key}`}>{fmt(value)}</span>
  </span>
  <NativeInput type="range" className="w-full accent-[var(--accent)]" min={control.min} max={control.max} step={control.step} value={value} disabled={disabled}
   aria-label={label} aria-valuetext={fmt(value)} data-testid={`photos-mask-slider-${control.key}`}
   onPointerDown={()=>beginPhotoGesture(name)} onChange={e=>{beginPhotoGesture(name);set(Number(e.target.value));}} onPointerUp={end} onBlur={end} onKeyUp={end}/>
 </label>;
}
const pct=(v:number)=>`${Math.round(v*100)}%`;
/** Luminosity/colour-range mask: one active mask (luma window, optional hue window) with ev/temp/sat through it. */
export function MaskPanel(){
 const {t}=useT();
 const [overlay,setOverlay]=usePanelState<boolean>('photos.lummask.overlay',false);
 return <PanelBody testId="photos-mask-panel">{({name,session})=>{
  const busy=isBusy(session);const m=session.now.lumMask??neutralLumMask();
  const hueOn=m.hueCenter!==null;
  const setMask=(change:(c:LumMask)=>LumMask)=>commitPhotoSettings(name,s=>({...s,lumMask:change(s.lumMask??neutralLumMask())}));
  return <fieldset disabled={busy} className="m-0 grid min-w-0 gap-3 border-0 p-0">
   <SectionHead>
    <Button size="tiny" variant="outline" aria-pressed={overlay} title={t('photos.p.mask.overlay')} aria-label={t('photos.p.mask.overlay')} onClick={()=>setOverlay(!overlay)} data-testid="photos-mask-overlay-toggle"><Eye size={12}/></Button>
    {session.status==='processing'&&<span className="text-ink-3" role="status">{t('photos.processing')}</span>}
    <Button size="tiny" variant="outline" disabled={lumMaskNeutral(m)} onClick={()=>setMask(()=>neutralLumMask())} data-testid="photos-mask-reset" aria-label={t('photos.p.mask.reset')}><RotateCcw size={11}/>{t('photos.p.reset')}</Button>
   </SectionHead>
   <div className="flex flex-wrap gap-1" role="group" aria-label={t('photos.p.mask.zones')}>
    {LUM_ZONES.map(z=><Button key={z.id} size="tiny" variant="outline" aria-pressed={m.lumaLo===z.lo&&m.lumaHi===z.hi} onClick={()=>setMask(c=>({...c,lumaLo:z.lo,lumaHi:z.hi}))} data-testid={`photos-mask-zone-${z.id}`}>{t(z.labelKey)}</Button>)}
   </div>
   <MaskSlider name={name} session={session} disabled={busy} control={{key:'lumaLo',labelKey:'photos.p.mask.lumaLo',min:0,max:1,step:0.01,fmt:pct}}/>
   <MaskSlider name={name} session={session} disabled={busy} control={{key:'lumaHi',labelKey:'photos.p.mask.lumaHi',min:0,max:1,step:0.01,fmt:pct}}/>
   <MaskSlider name={name} session={session} disabled={busy} control={{key:'feather',labelKey:'photos.p.mask.feather',min:0,max:0.5,step:0.01,fmt:pct}}/>
   <SectionHead title={t('photos.p.mask.hue')}>
    <Button size="tiny" variant="outline" aria-pressed={hueOn} onClick={()=>setMask(c=>({...c,hueCenter:hueOn?null:0}))} data-testid="photos-mask-hue-toggle">{hueOn?t('photos.p.mask.hueOn'):t('photos.p.mask.hueOff')}</Button>
   </SectionHead>
   {hueOn&&<>
    <MaskSlider name={name} session={session} disabled={busy} control={{key:'hueCenter',labelKey:'photos.p.mask.hueCenter',min:0,max:360,step:1,fmt:v=>`${Math.round(v)}°`}}/>
    <MaskSlider name={name} session={session} disabled={busy} control={{key:'hueRange',labelKey:'photos.p.mask.hueRange',min:5,max:180,step:1,fmt:v=>`${Math.round(v)}°`}}/>
   </>}
   <MaskSlider name={name} session={session} disabled={busy} control={{key:'ev',labelKey:'photos.p.mask.ev',min:-1,max:1,step:0.05}}/>
   <MaskSlider name={name} session={session} disabled={busy} control={{key:'temp',labelKey:'photos.p.mask.temp',min:-100,max:100,step:5}}/>
   <MaskSlider name={name} session={session} disabled={busy} control={{key:'sat',labelKey:'photos.p.mask.sat',min:-100,max:100,step:5}}/>
   <p className="m-0 text-ink-3">{t('photos.p.mask.note')}</p>
  </fieldset>;
 }}</PanelBody>;
}
