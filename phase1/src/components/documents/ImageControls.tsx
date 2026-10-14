import {useEffect,useRef,useState} from 'react';
import {IMAGE_WIDTH_PERCENTS,MAX_IMAGE_BYTES,validHfText,MAX_HF_CHARS} from '../../lib/documents/protocol';
import {insertImage,removeImage,resizeImageToPercent,setImageAlt} from '../../lib/documents/session';
import {patchDocuments,useDocuments} from '../../lib/documents/store';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
/** Insert a PNG or JPEG and, once a picture is selected, set its width, alt text or remove it. */
export function ImageControls(){
 const {t}=useT();const doc=useDocuments();const file=useRef<HTMLInputElement>(null);
 const img=doc.imageBlock===null?undefined:doc.blocks.find(b=>b.index===doc.imageBlock)?.image;
 const [alt,setAlt]=useState('');
 useEffect(()=>{setAlt(img?.alt??'');},[doc.imageBlock,img?.alt]);
 const ready=doc.status==='ready'&&(doc.caret!==null||doc.imageBlock!==null);
 const pick=async(f:File|undefined)=>{
  if(!f)return;
  if(f.size>MAX_IMAGE_BYTES){patchDocuments({editError:t('documents.image.tooBig')});return;}
  try{await insertImage(new Uint8Array(await f.arrayBuffer()));}catch{patchDocuments({editError:t('documents.image.unreadable')});}
 };
 const altOk=validHfText(alt);
 return <>
  <NativeButton className={tool} disabled={!ready} onClick={()=>file.current?.click()} data-testid="documents-image-insert">{t('documents.image.insert')}</NativeButton>
  <NativeInput ref={file} type="file" accept="image/png,image/jpeg" className="hidden" tabIndex={-1} aria-hidden="true" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void pick(f);}} data-testid="documents-image-file"/>
  {img&&<span className="flex items-center gap-1" role="group" aria-label={t('documents.image.label')} data-testid="documents-image-bar">
   {IMAGE_WIDTH_PERCENTS.map(p=><NativeButton key={p} className={tool+' tabular-nums'} aria-label={t('documents.image.width',{n:p})} title={t('documents.image.width',{n:p})} onClick={()=>void resizeImageToPercent(p)} data-testid={'documents-image-width-'+p}>{p+'%'}</NativeButton>)}
   <NativeInput className="h-7 w-40 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink" maxLength={MAX_HF_CHARS} value={alt} aria-label={t('documents.image.alt')} placeholder={t('documents.image.alt')} aria-invalid={!altOk} onChange={e=>setAlt(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'&&altOk&&alt!==img.alt)void setImageAlt(alt);}} data-testid="documents-image-alt"/>
   <NativeButton className={tool} disabled={!altOk||alt===img.alt} onClick={()=>void setImageAlt(alt)} data-testid="documents-image-alt-set">{t('documents.image.altSet')}</NativeButton>
   <NativeButton className={tool} onClick={()=>void removeImage()} data-testid="documents-image-remove">{t('documents.image.remove')}</NativeButton>
  </span>}
 </>;
}
