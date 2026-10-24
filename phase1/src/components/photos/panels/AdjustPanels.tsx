import {Pipette,RotateCcw,WandSparkles} from '../../../lib/icons';
import {useT} from '../../../lib/useT';
import {PHOTO_CONTROLS,neutralPhotoSettings} from '../../../lib/photos/studioSettings';
import {commitPhotoSettings} from '../../../lib/photos/studioSession';
import {deriveAutoTone,deriveAutoWhiteBalance} from '../../../lib/photos/autoTone';
import {Button} from '../../ui/button';
import {NativeSelect} from '../../ui/native-controls';
import {isWbPresetActive,WB_PRESETS} from '../../../lib/photos/wbPresets';
import {usePanelState} from '../../../store/panelStateStore';
import {PanelBody,SectionHead,SettingSlider,isBusy,runPhotos} from './shared';
export type AdjustSection='light'|'color'|'effects'|'detail';
/** One develop section (Light, Color, Effects, Detail) with per-section reset and exact-value fields. */
export function AdjustSectionBody({section,auto}:{section:AdjustSection;auto?:'tone'|'wb'}){
 const {t}=useT();
 // Hooks live in the panel body, never in the PanelBody render callback: the callback only runs once a
 // session exists, so a hook there changes the hook count on the empty -> photo transition and crashes the studio.
 const [wbPicker,setWbPicker]=usePanelState<boolean>('photos.wb.picker',false);
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
    {auto==='wb'&&<NativeSelect value={WB_PRESETS.find(p=>isWbPresetActive(session.now,p))?.id??''} disabled={isBusy(session)} aria-label={t('photos.p.wbPreset')} title={t('photos.p.wbPreset')} onChange={e=>{if(e.currentTarget.value)void runPhotos('photos.wb.preset',{preset:e.currentTarget.value});}} className="h-6" data-testid="photos-wb-preset">
     <option value="">{t('photos.p.wbPreset')}</option>
     {WB_PRESETS.map(p=><option key={p.id} value={p.id}>{t(p.labelKey)}</option>)}
    </NativeSelect>}
    {auto==='wb'&&<Button size="tiny" variant="outline" disabled={!frame} aria-pressed={wbPicker} onClick={()=>setWbPicker(!wbPicker)} data-testid="photos-color-wb-picker" aria-label={t('photos.p.auto.wbPicker')} title={t('photos.p.auto.wbPicker')}><Pipette size={11}/>{t('photos.p.auto.wbPicker')}</Button>}
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
