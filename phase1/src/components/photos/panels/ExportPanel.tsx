import {useState} from 'react';
import {usePhotoExport} from './usePhotoExport';
import {Download} from '../../../lib/icons';
import {useT} from '../../../lib/useT';
import {dirtyPhoto,exportPhotoCopy} from '../../../lib/photos/studioSession';
import {developablePhotos} from '../../../lib/photos/photoNav';
import {directoryPhotoHost,ensurePhotoReady,pickExportDirectory,runPhotoBatch,uniqueFileNames,webFsSupported} from '../../../lib/photos/batchExport';
import {defaultImageHost,editedName} from '../../../lib/imageEditorHost';
import {useMedia} from '../../../lib/media';
import {Button} from '../../ui/button';
import {PanelBody,isBusy} from './shared';
/** Export a developed copy. The original file is never overwritten; copies are bounded by the engine. */
export function ExportPanel(){
 const {t}=useT();const {note,working,run}=usePhotoExport();
 const media=useMedia();
 const photos=developablePhotos(media.items);
 const [batch,setBatch]=useState<{done:number;total:number}|null>(null);
 const [batchNote,setBatchNote]=useState('');
 const runBatch=async(format:'png'|'jpeg')=>{
  if(batch)return;
  setBatchNote('');setBatch({done:0,total:photos.length});
  try{
   const ext=format==='png'?'png':'jpg';
   let host;
   if(webFsSupported()){
    const dir=await pickExportDirectory();
    if(!dir)return;
    const uniq=uniqueFileNames(photos.map(p=>p.name),ext);
    host=directoryPhotoHost(dir,new Map(photos.map(p=>[editedName(p.name,ext),uniq.get(p.name)!])));
   }else host=await defaultImageHost();
   const out=await runPhotoBatch(photos.map(p=>p.name),async n=>{
    const item=media.items.find(i=>i.name===n);
    if(!item)throw Error(n);
    await ensurePhotoReady(item);
    return exportPhotoCopy(n,format,host);
   },p=>setBatch({done:p.done,total:p.total}));
   setBatchNote(t('photos.batch.summary',{saved:out.saved.length,skipped:out.skipped.length,failed:out.failed.length})+(out.failed.length?' '+t('photos.batch.failures',{names:out.failed.map(f=>f.name).join(', ')}):''));
  }catch(e){setBatchNote(t('photos.saveFailed',{message:e instanceof Error?e.message:String(e)}));}
  finally{setBatch(null);}
 };
 return <PanelBody testId="photos-export-panel">{({session})=>{
  const off=isBusy(session)||working||session.status==='processing'||session.cropping||batch!==null;
  return <>
   <div className="grid gap-1">
    <Button size="compact" variant="outline" disabled={off} onClick={()=>void run('png')} data-testid="photos-p-export-png"><Download size={13}/>{t('photos.export.png')}</Button>
    <Button size="compact" variant="outline" disabled={off} onClick={()=>void run('jpeg')} data-testid="photos-p-export-jpeg"><Download size={13}/>{t('photos.export.jpeg')}</Button>
   </div>
   {photos.length>=2&&<div className="grid gap-1">
    <Button size="compact" variant="outline" disabled={off} onClick={()=>void runBatch('png')} data-testid="photos-p-batch-png"><Download size={13}/>{t('photos.batch.png',{count:photos.length})}</Button>
    <Button size="compact" variant="outline" disabled={off} onClick={()=>void runBatch('jpeg')} data-testid="photos-p-batch-jpeg"><Download size={13}/>{t('photos.batch.jpeg',{count:photos.length})}</Button>
    <p className="photos-batch-status m-0 text-ink-2" role="status" aria-live="polite" data-testid="photos-p-batch-status">{batch?t('photos.batch.progress',{done:batch.done,total:batch.total}):batchNote}</p>
   </div>}
   <p className="m-0 text-[11px] text-ink-3">{t('photos.export.hint')}</p>
   <p className="m-0 text-[11px] text-ink-2" role="status" aria-live="polite" data-testid="photos-p-export-status">{note||(dirtyPhoto(session)?t('photos.status.dirty'):t('photos.status.clean'))}</p>
  </>;
 }}</PanelBody>;
}
