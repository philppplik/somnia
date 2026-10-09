import {Aperture,Image as ImageIcon} from '../../lib/icons';
import {Button} from '../ui/button';
import {FileTabs} from '../FileTabs';
import {useT} from '../../lib/useT';
import {openPhotoDialog} from '../../lib/photos/open';
import {PHOTO_INPUT} from '../../lib/photos/studioSettings';
import {useMedia} from '../../lib/media';
import {PhotosWorkspace} from './PhotosWorkspace';
/** Canvas of the Photos Studio: the opened photo, an honest "cannot develop this" note, or a start screen. */
export function PhotosCanvas(){
 const {t}=useT();const media=useMedia();const item=media.items.find(i=>i.name===media.active);
 const developable=item&&(item.kind==='image'&&(PHOTO_INPUT.mimes as readonly string[]).includes(item.mime));
 const refused=item&&(item.kind==='psd'||(item.kind==='image'&&!developable));
 return <main className="center" aria-label={t('photos.title')}><div className="workspace"><section className="code-pane" aria-label={t('photos.title')}>
  <FileTabs/>
  {developable?<PhotosWorkspace key={item.name} item={item}/>:refused?
   <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center" data-testid="photos-unsupported">
    <ImageIcon size={36} className="text-ink-3"/>
    <div><h1 className="m-0 text-[18px] font-semibold text-ink">{t('photos.unsupported.title')}</h1><p className="mx-auto mt-2 max-w-[420px] text-[13px] text-ink-2">{t('photos.unsupported.body',{name:item.name,mime:item.mime})}</p></div>
   </div>:
   <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center" data-testid="photos-start">
    <Aperture size={36} className="text-ink-3"/>
    <div><h1 className="m-0 text-[18px] font-semibold text-ink">{t('photos.start.title')}</h1><p className="mx-auto mt-2 max-w-[420px] text-[13px] text-ink-2">{t('photos.start.body')}</p></div>
    <Button variant="primary" onClick={()=>void openPhotoDialog()} data-testid="photos-open">{t('photos.start.open')}</Button>
    <p className="text-[11px] text-ink-3">{t('photos.start.drop')}</p>
   </div>}
 </section></div></main>;
}
