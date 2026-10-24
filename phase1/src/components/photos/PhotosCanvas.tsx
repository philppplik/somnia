import {studioContextStore} from '../../lib/shell/studioContext';
import {dirtyPhoto,getPhotoSession,subscribePhotos} from '../../lib/photos/studioSession';
import {getPhotoExportState,subscribePhotoExport} from '../../lib/photos/exportState';
import {PhotoExportPopover} from './PhotoExportPopover';
import {useEffect} from 'react';
import {registerPhotosCommands} from '../../lib/photos/panelCommands';
import {Aperture,Image as ImageIcon} from '../../lib/icons';
import {StudioEmptyState} from '../studios/StudioEmptyState';
import {FileTabs} from '../FileTabs';
import {useT} from '../../lib/useT';
import {openPhotoDialog} from '../../lib/photos/open';
import {PHOTO_INPUT} from '../../lib/photos/studioSettings';
import {useMedia} from '../../lib/media';
import {PhotosWorkspace} from './PhotosWorkspace';
/** Canvas of the Photos Studio: the opened photo, an honest "cannot develop this" note, or a start screen. */
export function PhotosCanvas(){
 const {t,locale}=useT();const media=useMedia();useEffect(()=>registerPhotosCommands(),[]);const item=media.items.find(i=>i.name===media.active);
 useEffect(()=>{const owner=studioContextStore.claim('photos');const report=()=>{const session=getPhotoSession(item?.name);owner.report({document:session?{id:session.name,kind:'photo',dirty:dirtyPhoto(session),readOnly:false}:undefined,busy:!!session&&session.status!=='ready'||getPhotoExportState().working,services:{ready:session?.status==='ready',cropping:!!session?.cropping},data:{status:session?.status??'empty'}});};report();const a=subscribePhotos(report),b=subscribePhotoExport(report);return()=>{a();b();owner.release();};},[item?.name]);
 const developable=item&&(item.kind==='image'&&(PHOTO_INPUT.mimes as readonly string[]).includes(item.mime));
 const refused=item&&(item.kind==='psd'||(item.kind==='image'&&!developable));
 return <main className="center" aria-label={t('photos.title')}><div className="workspace"><section className="code-pane" aria-label={t('photos.title')}>
  <FileTabs/><PhotoExportPopover/>
  {developable?<PhotosWorkspace key={item.name} item={item}/>:refused?
   <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center" data-testid="photos-unsupported">
    <ImageIcon size={36} className="text-ink-3"/>
    <div><h1 className="m-0 text-[18px] font-semibold text-ink">{t('photos.unsupported.title')}</h1><p className="mx-auto mt-2 max-w-[420px] text-[13px] text-ink-2">{t('photos.unsupported.body',{name:item.name,mime:item.mime})}</p></div>
   </div>:
   <StudioEmptyState studio="photos" icon={<Aperture/>} language={locale} onOpen={openPhotoDialog} testId="photos-start" openTestId="photos-open" copy={{headline:t('photos.start.title'),description:t('photos.start.body'),openLabel:t('photos.start.open'),footnote:t('photos.start.drop')}}/>}
 </section></div></main>;
}
