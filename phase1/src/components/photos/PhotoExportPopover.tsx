import {useEffect} from 'react';
import {Popover} from '@base-ui/react/popover';
import {useT} from '../../lib/useT';
import {setPhotoExportState} from '../../lib/photos/exportState';
import {isNeutralPhoto} from '../../lib/photos/studioSettings';
import {photoExportEnabled} from '../../lib/photos/panelCommands';
import {useActivePhoto} from './panels/shared';
import {usePhotoExport} from './panels/usePhotoExport';
import {Button} from '../ui/button';
/** Studio-owned host. Header remains data-only, and does not import photo controls. */
export function PhotoExportPopover(){
 const {t}=useT(),{session,name}=useActivePhoto(),e=usePhotoExport();
 useEffect(()=>()=>setPhotoExportState({open:false}),[]);
 useEffect(()=>{setPhotoExportState({open:false});},[name]);
 return <Popover.Root open={e.open&&!!session} onOpenChange={open=>setPhotoExportState({open})}>
  <Popover.Portal><Popover.Positioner anchor={()=>document.querySelector('[data-hero-id="photos.export.open"]')} sideOffset={8} align="end" className="z-50">
   <Popover.Popup className="menu-popup grid w-[300px] max-w-[calc(100vw-24px)] gap-3 !rounded-[25px] !p-4 text-xs" data-testid="photos-export-popover">
    <Popover.Title className="m-0 text-sm font-semibold">{t('photos.hero.export')}</Popover.Title>
    <form className="grid gap-3" onSubmit={ev=>{ev.preventDefault();if(photoExportEnabled())void e.run(e.format);}}>
     <label className="grid gap-1">{t('photos.hero.format')}<select autoFocus value={e.format} disabled={e.working} onChange={ev=>e.setFormat(ev.target.value as 'png'|'jpeg')} className="rounded-lg border border-line bg-panel p-2" data-testid="photos-export-format"><option value="png">PNG</option><option value="jpeg">JPEG</option></select></label>
     <p className="m-0 text-ink-3">{t('photos.hero.original')}</p>
     {session&&isNeutralPhoto(session.now)&&<p className="m-0 text-ink-3">{t('photos.hero.unchanged')}</p>}
     <Button type="submit" variant="primary" className="!text-white" disabled={!photoExportEnabled()}>{t('photos.hero.copy')}</Button>
     <p role="status" aria-live="polite" className="m-0 text-ink-2">{e.note}</p>
    </form>
   </Popover.Popup>
  </Popover.Positioner></Popover.Portal>
 </Popover.Root>;
}
