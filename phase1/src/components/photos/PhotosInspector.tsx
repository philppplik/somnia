import {useT} from '../../lib/useT';
import {useMedia} from '../../lib/media';
import {PHOTO_CONTROLS,type PhotoControl} from '../../lib/photos/studioSettings';
import {beginPhotoGesture,endPhotoGesture,flipPhoto,previewPhotoSettings,rotatePhoto,usePhotoSession} from '../../lib/photos/studioSession';
import {Button} from '../ui/button';
import {RotateCcw,RotateCw,ArrowLeftRight,ArrowUpDown} from '../../lib/icons';
const row='grid gap-1.5 border-b border-subtle px-3 py-3 text-xs text-ink-2';
const input='w-full accent-[var(--accent)]';
const SECTIONS=['light','color','effects','detail','transform'] as const;
function Slider({name,control,disabled}:{name:string;control:PhotoControl;disabled:boolean}){
 const {t}=useT();
 const session=usePhotoSession(name);
 const value=session?.now[control.key];
 if(typeof value!=='number')return null;
 const change=(v:number)=>{beginPhotoGesture(name);previewPhotoSettings(name,s=>({...s,[control.key]:v}));};
 const end=()=>endPhotoGesture(name);
 return <label className="grid gap-1">{t(control.label)}
  <span className="flex items-center gap-2">
   <input type="range" className={input} min={control.min} max={control.max} step={control.step} value={value} disabled={disabled}
    aria-label={t(control.label)} data-testid={`photos-slider-${control.key}`}
    onPointerDown={()=>beginPhotoGesture(name)} onChange={e=>change(Number(e.target.value))} onPointerUp={end} onBlur={end} onKeyUp={end}/>
   <span className="w-14 shrink-0 text-right tabular-nums text-ink-3" data-testid={`photos-value-${control.key}`}>{control.format?control.format(value):value}</span>
  </span>
 </label>;
}
/** The develop controls of the Photos Studio, grouped the way the engine applies them. */
export function PhotosInspector(){
 const {t}=useT();const media=useMedia();
 const item=media.items.find(i=>i.name===media.active);
 const session=usePhotoSession(item?.name);
 if(!item||!session)return <p className="p-3 text-xs text-ink-3">{t('photos.loading')}</p>;
 const disabled=session.status==='loading'||session.status==='error';
 return <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0" data-testid="photos-inspector" aria-label={t('photos.panel')}>
  {SECTIONS.map(section=>{
   const controls=PHOTO_CONTROLS.filter(c=>c.section===section);
   return <div key={section} className={row} data-testid={`photos-section-${section}`}>
    <span className="text-ink">{t(`photos.section.${section}`)}</span>
    {controls.map(c=><Slider key={c.key} name={item.name} control={c} disabled={disabled}/>)}
    {section==='transform'&&<div className="flex flex-wrap gap-1">
     <Button size="compact" variant="outline" onClick={()=>rotatePhoto(item.name,-1)} data-testid="photos-rotate-left"><RotateCcw size={13}/>{t('photos.rotateLeft')}</Button>
     <Button size="compact" variant="outline" onClick={()=>rotatePhoto(item.name,1)} data-testid="photos-rotate-right"><RotateCw size={13}/>{t('photos.rotateRight')}</Button>
     <Button size="compact" variant="outline" aria-pressed={session.now.flipH} onClick={()=>flipPhoto(item.name,'h')} data-testid="photos-flip-h"><ArrowLeftRight size={13}/>{t('photos.flipH')}</Button>
     <Button size="compact" variant="outline" aria-pressed={session.now.flipV} onClick={()=>flipPhoto(item.name,'v')} data-testid="photos-flip-v"><ArrowUpDown size={13}/>{t('photos.flipV')}</Button>
    </div>}
   </div>;
  })}
 </fieldset>;
}
