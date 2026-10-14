import {ArrowLeftRight,ArrowUpDown,Proportions,RotateCcw,RotateCw,Check,X,Frame} from '../../../lib/icons';
import {useT} from '../../../lib/useT';
import {CROP_ASPECTS,aspectRatio,orientedSize,outputSize,ratioLabel,type CropAspect} from '../../../lib/photos/cropAspect';
import {PHOTO_CONTROLS} from '../../../lib/photos/studioSettings';
import {Button} from '../../ui/button';
import {PanelBody,SectionHead,SettingSlider,isBusy,runPhotos} from './shared';
const straighten=PHOTO_CONTROLS.find(c=>c.key==='straighten')!;
/** Crop, aspect ratio, straighten, rotate and flip. The crop overlay itself lives on the canvas. */
export function TransformPanel(){
 const {t}=useT();
 return <PanelBody testId="photos-transform-panel">{({name,session})=>{
  const busy=isBusy(session);const s=session.now;
  const frame=orientedSize(session.sourceWidth,session.sourceHeight,s.orientation);
  const out=outputSize(session.sourceWidth,session.sourceHeight,s);
  const draft=session.cropDraft;
  const draftPx=draft?{w:Math.round((draft.x1-draft.x0)*frame.width),h:Math.round((draft.y1-draft.y0)*frame.height)}:null;
  const transformed=s.straighten!==0||s.orientation!==0||s.flipH||s.flipV||s.crop!==null;
  return <fieldset disabled={busy} className="m-0 grid min-w-0 gap-3 border-0 p-0">
   <SectionHead>
    <Button size="tiny" variant="outline" disabled={!transformed} onClick={()=>void runPhotos('photos.resetAdjustments',{section:'transform'})} data-testid="photos-transform-reset"><RotateCcw size={11}/>{t('photos.p.reset')}</Button>
   </SectionHead>
   <div className="grid gap-1.5" data-testid="photos-crop-block">
    <div className="flex flex-wrap gap-1">
     {!session.cropping
      ?<Button size="compact" variant="outline" onClick={()=>void runPhotos('photos.crop.start')} data-testid="photos-p-crop-start"><Frame size={13}/>{t('photos.crop')}</Button>
      :<>
       <Button size="compact" variant="primary" onClick={()=>void runPhotos('photos.crop.apply')} data-testid="photos-p-crop-apply"><Check size={13}/>{t('photos.crop.apply')}</Button>
       <Button size="compact" variant="outline" onClick={()=>void runPhotos('photos.crop.cancel')} data-testid="photos-p-crop-cancel"><X size={13}/>{t('photos.crop.cancel')}</Button>
      </>}
     <Button size="compact" variant="outline" disabled={!s.crop&&!session.cropping} onClick={()=>void runPhotos('photos.crop.reset')} data-testid="photos-p-crop-remove">{t('photos.p.crop.remove')}</Button>
    </div>
    <div role="group" aria-label={t('photos.p.crop.aspect')} className="flex flex-wrap gap-1" data-testid="photos-aspects">
     {CROP_ASPECTS.map((a:CropAspect)=><Button key={a} size="tiny" variant="outline" title={a==='original'?ratioLabel(frame.width,frame.height):undefined}
      aria-label={a==='free'||a==='original'?t(`photos.p.crop.${a}`):a} disabled={a!=='free'&&aspectRatio(a,frame.width,frame.height)===null}
      onClick={()=>void runPhotos('photos.crop.setAspect',{aspect:a})} data-testid={`photos-aspect-${a.replace(':','x')}`}>{a==='free'||a==='original'?t(`photos.p.crop.${a}`):a}</Button>)}
     <Button size="tiny" variant="outline" disabled={!session.cropping&&!s.crop} onClick={()=>void runPhotos('photos.crop.swapAspect')} data-testid="photos-aspect-swap" aria-label={t('photos.p.crop.swap')} title={t('photos.p.crop.swap')}><Proportions size={11}/>{t('photos.p.crop.swap')}</Button>
    </div>
    <p className="m-0 text-[11px] text-ink-3" data-testid="photos-crop-size">{draftPx?t('photos.p.crop.draft',{width:draftPx.w,height:draftPx.h}):t('photos.p.crop.output',{width:out.width,height:out.height,ratio:ratioLabel(out.width,out.height)})}{!draftPx&&out.estimated?` ${t('photos.p.crop.estimated')}`:''}</p>
    {session.cropping&&<p className="m-0 text-[11px] text-ink-3">{t('photos.crop.hint')}</p>}
   </div>
   <SettingSlider name={name} session={session} control={straighten} disabled={busy}/>
   <div className="flex flex-wrap gap-1" role="group" aria-label={t('photos.p.orient')}>
    <Button size="compact" variant="outline" onClick={()=>void runPhotos('photos.rotate',{direction:-1})} data-testid="photos-rotate-left"><RotateCcw size={13}/>{t('photos.rotateLeft')}</Button>
    <Button size="compact" variant="outline" onClick={()=>void runPhotos('photos.rotate',{direction:1})} data-testid="photos-rotate-right"><RotateCw size={13}/>{t('photos.rotateRight')}</Button>
    <Button size="compact" variant="outline" aria-pressed={s.flipH} onClick={()=>void runPhotos('photos.flip',{axis:'h'})} data-testid="photos-flip-h"><ArrowLeftRight size={13}/>{t('photos.flipH')}</Button>
    <Button size="compact" variant="outline" aria-pressed={s.flipV} onClick={()=>void runPhotos('photos.flip',{axis:'v'})} data-testid="photos-flip-v"><ArrowUpDown size={13}/>{t('photos.flipV')}</Button>
   </div>
  </fieldset>;
 }}</PanelBody>;
}
