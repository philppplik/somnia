import {useEffect,useMemo,useRef,useState} from 'react';
import {setPhotoExportState,usePhotoExportState} from '../../lib/photos/exportState';
import {aspectComplement} from '../../lib/export/dimensions';
import {exportPhotoCopyAdvanced,renderPhotoExportPreview} from '../../lib/photos/studioSession';
import {photoExportSchema,photoOptionsToValues,valuesToPhotoOptions,PHOTO_EXPORT_DEFAULTS} from '../../lib/photos/photosExportSchema';
import type {ExportValues,ExportValue} from '../../lib/export/schema';
import {AdvancedExportDialog,type ExportPreview} from '../export/AdvancedExportDialog';
import {useActivePhoto} from './panels/shared';
/** Studio-owned host: the header command opens the shared Advanced Export dialog for Photos (AE1). */
export function PhotoExportPopover(){
 const {session,name}=useActivePhoto();const e=usePhotoExportState();
 const source=useMemo(()=>({width:session?.sourceWidth??2048,height:session?.sourceHeight??2048}),[session?.sourceWidth,session?.sourceHeight]);
 const schema=useMemo(()=>photoExportSchema(source),[source]);
 const base=()=>(name??'photo').replace(/\.[^.\\/]+$/,'');
 const [values,setValues]=useState<ExportValues>(()=>({...photoOptionsToValues(PHOTO_EXPORT_DEFAULTS),name:base()}));
 const [preview,setPreview]=useState<ExportPreview|null>(null);const [rendering,setRendering]=useState(false);
 const [errorKey,setErrorKey]=useState<string|null>(null);const [errorDetail,setErrorDetail]=useState('');
 const url=useRef<string|null>(null);const seq=useRef(0);
 useEffect(()=>()=>{setPhotoExportState({open:false});if(url.current)URL.revokeObjectURL(url.current);},[]);
 useEffect(()=>{setPhotoExportState({open:false});},[name]);
 useEffect(()=>{if(e.open)setValues(v=>({...v,name:v.name||base()}));},[e.open]);
 const change=(id:string,value:ExportValue)=>setValues(v=>{
  const next={...v,[id]:value};
  if(v.lockAspect&&v.mode==='exact'&&(id==='width'||id==='height')&&typeof value==='number'&&value>=1)next[id==='width'?'height':'width']=aspectComplement(source,id,value);
  return next;
 });
 const apply=(preset:ExportValues)=>setValues(v=>({...v,...preset,name:v.name}));
 useEffect(()=>{
  if(!e.open||!session||!name)return;
  if(schema.validate(values)!==null){setPreview(null);setRendering(false);return;}
  const id=++seq.current;const timer=setTimeout(()=>{setRendering(true);setErrorKey(null);
   renderPhotoExportPreview(name,valuesToPhotoOptions(values)).then(r=>{
    if(seq.current!==id)return;
    if(url.current)URL.revokeObjectURL(url.current);
    url.current=URL.createObjectURL(r.blob);
    setPreview({url:url.current,bytes:r.bytes,width:r.width,height:r.height,note:r.note});setRendering(false);
   }).catch(err=>{if(seq.current!==id)return;setRendering(false);setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));});
  },450);
  return()=>clearTimeout(timer);
 },[values,e.open,session,name,schema]);
 const run=async()=>{
  if(e.working||!name)return;setErrorKey(null);setPhotoExportState({working:true});
  try{const outcome=await exportPhotoCopyAdvanced(name,valuesToPhotoOptions(values));if(outcome==='saved')setPhotoExportState({open:false});}
  catch(err){setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));}
  finally{setPhotoExportState({working:false});}
 };
 return <AdvancedExportDialog open={e.open&&!!session} onClose={()=>setPhotoExportState({open:false})} schema={schema} values={values} onChange={change} onApply={apply} preview={preview} rendering={rendering} busy={e.working} errorKey={errorKey} errorDetail={errorDetail} onExport={()=>void run()} contentTestId="photos-export-popover" fieldTestIds={{format:'photos-export-format'}}/>;
}
