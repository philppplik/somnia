import {useEffect,useRef,useState} from 'react';
import {imageCropProblem,IMAGE_WRAPS,IMAGE_ALIGNS,type ImageWrap,type ImageAlign,IMAGE_WIDTH_PERCENTS,MAX_IMAGE_BYTES,validHfText,MAX_HF_CHARS} from '../../lib/documents/protocol';
import {insertImage,removeImage,resizeImageToPercent,setImageAlt,setImageWrap,setImageCrop,addFigureCaption} from '../../lib/documents/session';
import {patchDocuments,useDocuments} from '../../lib/documents/store';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
/** Insert a PNG or JPEG and, once a picture is selected, set its width, alt text or remove it. */
/** The four crop fields as typed text: empty reads as 0. Null when a field is not a number or the crop is out of range. */
export function parseCrop(f:readonly string[]):number[]|null{
 if(f.length!==4)return null;
 const v=f.map(x=>x.trim()===''?0:/^\d{1,2}([.,]\d)?$/.test(x.trim())?Number(x.trim().replace(',','.')):Number.NaN);
 return imageCropProblem(v)===null?v:null;
}
const CROP_SIDES=['left','top','right','bottom'] as const;
export function ImageControls(){
 const {t}=useT();const doc=useDocuments();const file=useRef<HTMLInputElement>(null);
 const img=doc.imageBlock===null?undefined:doc.blocks.find(b=>b.index===doc.imageBlock)?.image;
 const [alt,setAlt]=useState('');const [crop,setCrop]=useState(['','','','']);const [cropOpen,setCropOpen]=useState(false);
 useEffect(()=>{setAlt(img?.alt??'');setCrop((img?.crop??[0,0,0,0]).map(v=>v===0?'':String(v)));setCropOpen(false);},[doc.imageBlock,img?.alt,img?.crop?.join(',')]);
 const cropVals=parseCrop(crop);
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
   <NativeSelect className="h-7 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink" value={img.wrap??'inline'} aria-label={t('documents.image.wrap')} onChange={e=>void setImageWrap(e.currentTarget.value as ImageWrap,img.align??'left')} data-testid="documents-image-wrap">
    {IMAGE_WRAPS.map(w=><option key={w} value={w}>{t('documents.image.wrap.'+w)}</option>)}</NativeSelect>
   {IMAGE_ALIGNS.map(a=><NativeButton key={a} className={tool} aria-pressed={(img.align??'left')===a} aria-label={t('documents.image.align.'+a)} title={t('documents.image.align.'+a)} onClick={()=>void setImageWrap(img.wrap??'inline',a as ImageAlign)} data-testid={'documents-image-align-'+a}>{t('documents.image.align.'+a)}</NativeButton>)}
   <NativeInput className="h-7 w-40 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink" maxLength={MAX_HF_CHARS} value={alt} aria-label={t('documents.image.alt')} placeholder={t('documents.image.alt')} aria-invalid={!altOk} onChange={e=>setAlt(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'&&altOk&&alt!==img.alt)void setImageAlt(alt);}} data-testid="documents-image-alt"/>
   <NativeButton className={tool} disabled={!altOk||alt===img.alt} onClick={()=>void setImageAlt(alt)} data-testid="documents-image-alt-set">{t('documents.image.altSet')}</NativeButton>
   <NativeButton className={tool} aria-pressed={cropOpen} onClick={()=>setCropOpen(!cropOpen)} data-testid="documents-image-crop-toggle">{t('documents.image.crop')}</NativeButton>
   {cropOpen&&<span className="flex items-center gap-1" role="group" aria-label={t('documents.image.crop')}>
    {CROP_SIDES.map((s,i)=><NativeInput key={s} className="h-7 w-14 rounded-sm border border-subtle bg-surface px-1 text-xs tabular-nums text-ink" inputMode="decimal" maxLength={4} value={crop[i]} aria-label={t('documents.image.crop.'+s)} placeholder={t('documents.image.crop.'+s)} aria-invalid={cropVals===null} onChange={e=>setCrop(crop.map((x,j)=>j===i?e.currentTarget.value:x))} data-testid={'documents-image-crop-'+s}/>)}
    <NativeButton className={tool} disabled={cropVals===null} onClick={()=>{if(cropVals)void setImageCrop(cropVals);}} data-testid="documents-image-crop-apply">{t('documents.para.opt.apply')}</NativeButton>
    <NativeButton className={tool} onClick={()=>void setImageCrop([0,0,0,0])} data-testid="documents-image-crop-reset">{t('documents.image.crop.reset')}</NativeButton></span>}
   <NativeButton className={tool} onClick={()=>void addFigureCaption()} data-testid="documents-image-caption">{t('documents.figure.caption')}</NativeButton>
   <NativeButton className={tool} onClick={()=>void removeImage()} data-testid="documents-image-remove">{t('documents.image.remove')}</NativeButton>
  </span>}
 </>;
}
