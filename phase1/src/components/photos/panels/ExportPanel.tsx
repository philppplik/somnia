import {usePhotoExport} from './usePhotoExport';
import {Download} from '../../../lib/icons';
import {useT} from '../../../lib/useT';
import {dirtyPhoto} from '../../../lib/photos/studioSession';
import {Button} from '../../ui/button';
import {PanelBody,isBusy} from './shared';
/** Export a developed copy. The original file is never overwritten; copies are bounded by the engine. */
export function ExportPanel(){
 const {t}=useT();const {note,working,run}=usePhotoExport();
 return <PanelBody testId="photos-export-panel">{({session})=>{
  const off=isBusy(session)||working||session.status==='processing'||session.cropping;
  return <>
   <div className="grid gap-1">
    <Button size="compact" variant="outline" disabled={off} onClick={()=>void run('png')} data-testid="photos-p-export-png"><Download size={13}/>{t('photos.export.png')}</Button>
    <Button size="compact" variant="outline" disabled={off} onClick={()=>void run('jpeg')} data-testid="photos-p-export-jpeg"><Download size={13}/>{t('photos.export.jpeg')}</Button>
   </div>
   <p className="m-0 text-[11px] text-ink-3">{t('photos.export.hint')}</p>
   <p className="m-0 text-[11px] text-ink-2" role="status" aria-live="polite" data-testid="photos-p-export-status">{note||(dirtyPhoto(session)?t('photos.status.dirty'):t('photos.status.clean'))}</p>
  </>;
 }}</PanelBody>;
}
