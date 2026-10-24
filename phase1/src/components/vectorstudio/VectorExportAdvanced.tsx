import {useEffect,useMemo,useRef,useState} from 'react';
import {setVectorExportAdvancedOpen,useVectorExportAdvancedOpen} from '../../lib/vectorstudio/exportAdvancedState';
import {useVectorSession} from '../../lib/vectorstudio/session';
import {exportAreaDoc} from '../../lib/vectorstudio/exportArea';
import {vectorExportSchema,vectorOptionsToValues,valuesToVectorOptions,VECTOR_EXPORT_DEFAULTS} from '../../lib/vectorstudio/vectorExportSchema';
import {buildVectorExport,downloadBlob} from '../../lib/vectorstudio/exportAdvanced';
import {aspectComplement} from '../../lib/export/dimensions';
import type {ExportValues,ExportValue} from '../../lib/export/schema';
import {AdvancedExportDialog,type ExportPreview} from '../export/AdvancedExportDialog';
/** Studio-owned host: opens the shared Advanced Export dialog for Vector (AE2) - SVG/PNG, area, exact size, background, metadata, live preview. */
export function VectorExportAdvanced(){
 const s=useVectorSession();const open=useVectorExportAdvancedOpen();
 const areaSize=useMemo(()=>(area:'page'|'selection'|'content',padding:number)=>{try{const d=exportAreaDoc(s.doc,s.selection,area,padding);return {width:d.width,height:d.height};}catch{return null;}},[s.doc,s.selection]);
 const schema=useMemo(()=>vectorExportSchema(areaSize),[areaSize]);
 const base=()=>(s.name||'').replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'')||'drawing';
 const [values,setValues]=useState<ExportValues>(()=>({...vectorOptionsToValues(VECTOR_EXPORT_DEFAULTS)}));
 const [preview,setPreview]=useState<ExportPreview|null>(null);const [rendering,setRendering]=useState(false);const [working,setWorking]=useState(false);
 const [errorKey,setErrorKey]=useState<string|null>(null);const [errorDetail,setErrorDetail]=useState('');
 const url=useRef<string|null>(null);const seq=useRef(0);
 useEffect(()=>{if(open)setValues(v=>({...v,name:v.name||base()}));},[open]);
 useEffect(()=>()=>{setVectorExportAdvancedOpen(false);if(url.current)URL.revokeObjectURL(url.current);},[]);
 const change=(id:string,value:ExportValue)=>setValues(v=>{
  const next={...v,[id]:value};
  const o=valuesToVectorOptions(v);const a=areaSize(o.area,o.padding);
  if(a&&v.lockAspect&&v.mode==='exact'&&(id==='width'||id==='height')&&typeof value==='number'&&value>=1)next[id==='width'?'height':'width']=aspectComplement(a,id,value);
  return next;
 });
 const apply=(preset:ExportValues)=>setValues(v=>({...v,...preset,name:v.name}));
 useEffect(()=>{
  if(!open)return;
  if(schema.validate(values)!==null){setPreview(null);setRendering(false);return;}
  const id=++seq.current;const timer=setTimeout(()=>{setRendering(true);setErrorKey(null);
   buildVectorExport(valuesToVectorOptions(values)).then(r=>{
    if(seq.current!==id)return;
    if(url.current)URL.revokeObjectURL(url.current);
    url.current=URL.createObjectURL(r.blob);
    setPreview({url:url.current,bytes:r.bytes,width:r.width,height:r.height,note:null});setRendering(false);
   }).catch(err=>{if(seq.current!==id)return;setRendering(false);setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));});
  },350);
  return()=>clearTimeout(timer);
 },[values,open,schema]);
 const run=async()=>{
  if(working)return;setErrorKey(null);setWorking(true);
  try{const r=await buildVectorExport(valuesToVectorOptions(values));downloadBlob(r.blob,r.filename);setVectorExportAdvancedOpen(false);}
  catch(err){setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));}
  finally{setWorking(false);}
 };
 return <AdvancedExportDialog open={open&&s.open} onClose={()=>setVectorExportAdvancedOpen(false)} schema={schema} values={values} onChange={change} onApply={apply} preview={preview} rendering={rendering} busy={working} errorKey={errorKey} errorDetail={errorDetail} onExport={()=>void run()} contentTestId="vector-export-advanced"/>;
}
