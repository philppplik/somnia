import {RotateCcw,WandSparkles} from '../../../lib/icons';
import {useT} from '../../../lib/useT';
import {PHOTO_CONTROLS,neutralPhotoSettings} from '../../../lib/photos/studioSettings';
import {commitPhotoSettings} from '../../../lib/photos/studioSession';
import {deriveAutoTone,deriveAutoWhiteBalance} from '../../../lib/photos/autoTone';
import {Button} from '../../ui/button';
import {PanelBody,SectionHead,SettingSlider,isBusy,runPhotos} from './shared';
export type AdjustSection='light'|'color'|'effects'|'detail';
/** One develop section (Light, Color, Effects, Detail) with per-section reset and exact-value fields. */
export function AdjustSectionBody({section,auto}:{section:AdjustSection;auto?:'tone'|'wb'}){
 const {t}=useT();
 const controls=PHOTO_CONTROLS.filter(c=>c.section===section);
 return <PanelBody testId={`photos-${section}-panel`}>{({name,session})=>{
  const changed=controls.some(c=>session.now[c.key]!==neutralPhotoSettings[c.key]);
  const frame=session.frame;
  const runAuto=()=>{ // one atomic commit: the whole pick is one undo step
   if(!frame)return;const bytes=new Uint8Array(frame.bytes.slice(0));
   if(auto==='tone'){const pick=deriveAutoTone(bytes,frame.width,frame.height);commitPhotoSettings(name,s=>({...s,...pick}));}
   if(auto==='wb'){const pick=deriveAutoWhiteBalance(bytes,frame.width,frame.height);commitPhotoSettings(name,s=>({...s,...pick}));}
  };
  return <fieldset disabled={isBusy(session)} className="m-0 grid min-w-0 gap-3 border-0 p-0">
   <SectionHead>
    {auto&&<Button size="tiny" variant="outline" disabled={!frame} onClick={runAuto} data-testid={`photos-${section}-auto`} aria-label={t(`photos.p.auto.${auto}`)}><WandSparkles size={11}/>{t(`photos.p.auto.${auto}`)}</Button>}
    {session.status==='processing'&&<span className="text-ink-3" role="status">{t('photos.processing')}</span>}
    <Button size="tiny" variant="outline" disabled={!changed} onClick={()=>void runPhotos('photos.resetAdjustments',{section})} data-testid={`photos-${section}-reset`} aria-label={t('photos.p.resetSection',{section:t(`photos.section.${section}`)})}><RotateCcw size={11}/>{t('photos.p.reset')}</Button>
   </SectionHead>
   {controls.map(c=><SettingSlider key={c.key} name={name} session={session} control={c} disabled={isBusy(session)}/>)}
  </fieldset>;
 }}</PanelBody>;
}
export const LightPanel=()=><AdjustSectionBody section="light" auto="tone"/>;
export const ColorPanel=()=><AdjustSectionBody section="color" auto="wb"/>;
export const EffectsPanel=()=><AdjustSectionBody section="effects"/>;
export const DetailPanel=()=><AdjustSectionBody section="detail"/>;
