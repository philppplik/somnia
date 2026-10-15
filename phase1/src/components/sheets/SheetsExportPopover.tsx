import {useEffect,useMemo,useState} from 'react';
import {setSheetsExportState,useSheetsExportState} from '../../lib/sheets/exportState';
import {sheetsExportSchema,sheetsOptionsToValues,valuesToSheetsOptions,SHEETS_EXPORT_DEFAULTS} from '../../lib/sheets/sheetsExportSchema';
import {saveSheetsCopyAdvanced} from '../../lib/sheets/session';
import type {ExportValues,ExportValue} from '../../lib/export/schema';
import {AdvancedExportDialog} from '../export/AdvancedExportDialog';
/** Studio-owned host: opens the shared Advanced Export dialog for Sheets (AE1) — file name plus Dublin Core metadata; the engine writes xlsx only, so there is no size/format preview. */
export function SheetsExportPopover({name,ready,getBytes,onSaved}:{name:string;ready:boolean;getBytes:()=>Promise<Uint8Array>;onSaved:(r:'saved'|'downloaded'|'cancelled')=>void}){
 const e=useSheetsExportState();
 const schema=useMemo(()=>sheetsExportSchema(),[]);
 const base=()=>name.replace(/^.*[\\/]/,'').replace(/\.xlsx$/i,'');
 const [values,setValues]=useState<ExportValues>(()=>({...sheetsOptionsToValues(SHEETS_EXPORT_DEFAULTS)}));
 const [errorKey,setErrorKey]=useState<string|null>(null);const [errorDetail,setErrorDetail]=useState('');
 useEffect(()=>{if(e.open)setValues(v=>({...v,name:v.name||base()}));},[e.open]);
 useEffect(()=>()=>{setSheetsExportState({open:false});},[]);
 const change=(id:string,value:ExportValue)=>setValues(v=>({...v,[id]:value}));
 const apply=(preset:ExportValues)=>setValues(v=>({...v,...preset,name:v.name}));
 const run=async()=>{
  if(e.working)return;setErrorKey(null);setSheetsExportState({working:true});
  try{
   const o=valuesToSheetsOptions(values);
   const outcome=await saveSheetsCopyAdvanced(o.name||base(),await getBytes(),{title:o.metaTitle,author:o.metaAuthor,description:o.metaDescription});
   onSaved(outcome);
   if(outcome!=='cancelled')setSheetsExportState({open:false});
  }catch(err){setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));}
  finally{setSheetsExportState({working:false});}
 };
 return <AdvancedExportDialog open={e.open&&ready} onClose={()=>setSheetsExportState({open:false})} schema={schema} values={values} onChange={change} onApply={apply} preview={null} rendering={false} busy={e.working} errorKey={errorKey} errorDetail={errorDetail} onExport={()=>void run()} contentTestId="sheets-export-advanced"/>;
}
