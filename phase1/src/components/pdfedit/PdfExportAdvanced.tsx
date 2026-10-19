import {useEffect,useMemo,useRef,useState} from 'react';
import {setPdfExportAdvanced,usePdfExportAdvanced} from '../../lib/pdfedit/exportAdvancedState';
import {exportPdfCopy,getPdfSession,pdfError,savePdfBytes,usePdfSession} from '../../lib/pdfedit/session';
import {pdfExportFileName,pdfExportSchema,pdfFileStem,pdfOptionsToValues,pdfPipelineOptions,valuesToPdfOptions,PDF_EXPORT_DEFAULTS} from '../../lib/pdfedit/exportAdvanced';
import {exportPdf} from '../../lib/pdf/export/pipeline';
import {exportPrintInWorker} from '../../lib/pdf/export/workerClient';
import {browserPdfRenderer} from '../../lib/pdf/export/browserRenderer';
import type {ExportValues,ExportValue} from '../../lib/export/schema';
import {AdvancedExportDialog} from '../export/AdvancedExportDialog';
/** Studio-owned host: opens the shared Advanced Export dialog for PDF (AE2). The editable copy is the normal Save copy; the flattened copies go through the flatten pipeline and the same native save grant. */
export function PdfExportAdvanced({name}:{name:string}){
 const open=usePdfExportAdvanced()===name;const s=usePdfSession(name);
 const protectedDoc=!s?.info||s.info.signed||s.info.encrypted||s.info.xfa;
 const canvas=typeof document!=='undefined'&&typeof document.createElement==='function';
 const schema=useMemo(()=>pdfExportSchema({hasBytes:!!s?.bytes,protectedDoc,canvas}),[!!s?.bytes,protectedDoc,canvas]);
 const [values,setValues]=useState<ExportValues>(()=>pdfOptionsToValues(PDF_EXPORT_DEFAULTS));
 const [working,setWorking]=useState(false);const [errorKey,setErrorKey]=useState<string|null>(null);const [errorDetail,setErrorDetail]=useState('');
 const ctl=useRef<AbortController|null>(null);
 useEffect(()=>{if(!open)return;setValues(pdfOptionsToValues({...PDF_EXPORT_DEFAULTS,name:pdfFileStem(name.replace(/^.*[\\/]/,''))}));setErrorKey(null);},[open]);
 useEffect(()=>()=>{ctl.current?.abort();setPdfExportAdvanced(null);},[]);
 const change=(id:string,value:ExportValue)=>setValues(v=>({...v,[id]:value}));
 const apply=(preset:ExportValues)=>setValues(v=>({...v,...preset,name:v.name}));
 const run=async()=>{
  if(working||!s?.bytes)return;setErrorKey(null);setWorking(true);
  const o=valuesToPdfOptions(values),snapshot=s.bytes;const ac=new AbortController();ctl.current=ac;
  try{
   if(o.output==='edited'){await exportPdfCopy(name,pdfFileStem(o.name));setPdfExportAdvanced(null);return;}
   const opts={...pdfPipelineOptions(o),signal:ac.signal};
   const result=o.output==='print'?await exportPrintInWorker(snapshot,opts):await exportPdf(snapshot,{...opts,preset:'screen',renderer:browserPdfRenderer});
   // The document changed while the copy was made: do not save a copy of an older state.
   if(getPdfSession(name)?.bytes!==snapshot)throw new Error('The document changed during the export. Nothing was saved.');
   if(await savePdfBytes(result.bytes,pdfExportFileName(o))){
    // A flattened copy is a separate file: the open document and its unsaved state are untouched.
    if(result.warnings.length)pdfError(name,'Flattened copy saved. '+result.warnings.join(' '));
    setPdfExportAdvanced(null);
   }
  }catch(err){if(!(err instanceof DOMException&&err.name==='AbortError')){setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));}}
  finally{setWorking(false);ctl.current=null;}
 };
 return <AdvancedExportDialog open={open&&!!s?.bytes} onClose={()=>setPdfExportAdvanced(null)} schema={schema} values={values} onChange={change} onApply={apply} preview={null} rendering={false} busy={working} onStop={()=>ctl.current?.abort()} errorKey={errorKey} errorDetail={errorDetail} onExport={()=>void run()}/>;
}
