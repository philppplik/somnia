import {useT} from '../../../lib/useT';
import {useMedia} from '../../../lib/media';
import {dirtyPhoto} from '../../../lib/photos/studioSession';
import {outputSize,ratioLabel} from '../../../lib/photos/cropAspect';
import {describeChange} from '../../../lib/photos/historyLog';
import {neutralPhotoSettings,PHOTO_INPUT} from '../../../lib/photos/studioSettings';
import {photosEngines} from '../../../lib/photos/registry';
import {PanelBody} from './shared';
import {ensureCaptureDates,exposureLine,getCaptureEntry,useCaptureDates} from '../../../lib/photos/captureDates';
import {useEffect} from 'react';
import {RatingStars} from '../RatingStars';
const mb=(n:number)=>n>=1_000_000?`${(n/1_000_000).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1000))} kB`;
/** File, source, output and session facts. Every row is read from the live session, nothing is invented. */
const exifDateFmt=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'});
export function InfoPanel(){
 const {t}=useT();const media=useMedia();
 useCaptureDates(); // re-render as EXIF entries land
 const activeItem=media.items.find(i=>i.name===media.active);
 useEffect(()=>{if(activeItem)ensureCaptureDates([activeItem]);},[activeItem]); // resolve the active photo's entry for the EXIF rows below
 return <PanelBody testId="photos-info-panel">{({name,session})=>{
  const item=media.items.find(i=>i.name===name);
  const exif=item?getCaptureEntry(item.name,item.size):null;
  const xline=exif?exposureLine(exif):'';
  const out=outputSize(session.sourceWidth,session.sourceHeight,session.now);
  const changed=describeChange(neutralPhotoSettings,session.now).length;
  const mp=session.sourceWidth*session.sourceHeight/1_000_000;
  const rows:[string,string][]=[
   [t('photos.p.info.file'),name],
   [t('photos.p.info.type'),item?.mime??''],
   [t('photos.p.info.size'),item?mb(item.size):''],
   [t('photos.p.info.source'),session.sourceWidth?`${session.sourceWidth} × ${session.sourceHeight} px (${mp.toFixed(1)} MP, ${ratioLabel(session.sourceWidth,session.sourceHeight)})`:'-'],
   [t('photos.p.info.output'),session.sourceWidth?`${out.width} × ${out.height} px${out.estimated?' ~':''}`:'-'],
   [t('photos.p.info.engine'),photosEngines.lightcraft.label],
   [t('photos.p.info.changed'),String(changed)],
   [t('photos.p.info.state'),dirtyPhoto(session)?t('photos.status.dirty'):t('photos.status.clean')],
   ...(exif?.cam?[[t('photos.p.info.camera'),exif.cam] as [string,string]]:[]),
   ...(exif?.lens?[[t('photos.p.info.lens'),exif.lens] as [string,string]]:[]),
   ...(xline?[[t('photos.p.info.exposure'),xline] as [string,string]]:[]),
   ...(exif?.t?[[t('photos.p.info.date'),exifDateFmt.format(exif.t)] as [string,string]]:[]),
  ];
  return <>
   <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" data-testid="photos-info-rows">
    {rows.map(([k,v])=><div key={k} className="contents"><dt className="text-ink-3">{k}</dt><dd className="m-0 break-words text-right text-ink">{v}</dd></div>)}
   </dl>
   <div className="flex items-center justify-between gap-2" data-testid="photos-info-rating-row"><span className="text-ink-3">{t('photos.rating.label')}</span><RatingStars name={name} prefix="photos-info"/></div>
   <p className="m-0 text-[11px] text-ink-3">{t('photos.p.info.limits',{max:Math.round(PHOTO_INPUT.maxBytes/1_048_576),mp:Math.round(PHOTO_INPUT.maxPixels/1_000_000)})}</p>
  </>;
 }}</PanelBody>;
}
