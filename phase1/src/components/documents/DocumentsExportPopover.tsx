import {useEffect,useMemo,useState} from 'react';
import {patchDocumentsExportUi,requestDocumentsSaveAdvanced,useDocumentsExportUi} from '../../lib/documents/exportBridge';
import {useDocuments} from '../../lib/documents/store';
import {documentsExportSchema,documentsOptionsToValues,valuesToDocumentsOptions,DOCUMENTS_EXPORT_DEFAULTS} from '../../lib/documents/documentsExportSchema';
import type {ExportValues,ExportValue} from '../../lib/export/schema';
import {AdvancedExportDialog} from '../export/AdvancedExportDialog';
/** Studio-owned host: opens the shared Advanced Export dialog for Documents (AE1) — file name plus Dublin Core metadata. Runs through the same loss-warning gate as every other save. */
export function DocumentsExportPopover(){
 const e=useDocumentsExportUi();const doc=useDocuments();
 const schema=useMemo(()=>documentsExportSchema(),[]);
 const base=()=>doc.name.replace(/^.*[\\/]/,'').replace(/\.docx$/i,'');
 const [values,setValues]=useState<ExportValues>(()=>({...documentsOptionsToValues(DOCUMENTS_EXPORT_DEFAULTS)}));
 const [errorKey,setErrorKey]=useState<string|null>(null);const [errorDetail,setErrorDetail]=useState('');
 useEffect(()=>{if(e.advancedOpen)setValues(v=>({...v,name:v.name||base()}));},[e.advancedOpen]);
 const change=(id:string,value:ExportValue)=>setValues(v=>({...v,[id]:value}));
 const apply=(preset:ExportValues)=>setValues(v=>({...v,...preset,name:v.name}));
 const run=async()=>{
  if(doc.saving)return;setErrorKey(null);
  try{
   const o=valuesToDocumentsOptions(values);
   patchDocumentsExportUi({advancedOpen:false});
   await requestDocumentsSaveAdvanced(o.name||base(),{title:o.metaTitle,author:o.metaAuthor,description:o.metaDescription});
  }catch(err){setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));}
 };
 return <AdvancedExportDialog open={e.advancedOpen&&doc.status==='ready'} onClose={()=>patchDocumentsExportUi({advancedOpen:false})} schema={schema} values={values} onChange={change} onApply={apply} preview={null} rendering={false} busy={doc.saving} errorKey={errorKey} errorDetail={errorDetail} onExport={()=>void run()} contentTestId="documents-export-advanced"/>;
}
