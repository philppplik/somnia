import {useEffect,useMemo,useState} from 'react';
import {setSlidesExportState,useSlidesExportState} from '../../lib/slides/exportState';
import {slidesExportSchema,slidesOptionsToValues,valuesToSlidesOptions,SLIDES_EXPORT_DEFAULTS} from '../../lib/slides/slidesExportSchema';
import {saveSlidesCopyAdvanced,useSlidesSession} from '../../lib/slides/session';
import type {ExportValues,ExportValue} from '../../lib/export/schema';
import {AdvancedExportDialog} from '../export/AdvancedExportDialog';
/** Studio-owned host: opens the shared Advanced Export dialog for Slides (AE1) — file name plus Dublin Core metadata; the engine writes pptx only, so there is no size/format preview. */
export function SlidesExportPopover(){
 const e=useSlidesExportState();const s=useSlidesSession();
 const schema=useMemo(()=>slidesExportSchema(),[]);
 const base=()=>s.name.replace(/^.*[\\/]/,'').replace(/\.pptx$/i,'');
 const [values,setValues]=useState<ExportValues>(()=>({...slidesOptionsToValues(SLIDES_EXPORT_DEFAULTS)}));
 const [errorKey,setErrorKey]=useState<string|null>(null);const [errorDetail,setErrorDetail]=useState('');
 useEffect(()=>{if(e.open)setValues(v=>({...v,name:v.name||base()}));},[e.open]);
 useEffect(()=>()=>{setSlidesExportState({open:false});},[]);
 const change=(id:string,value:ExportValue)=>setValues(v=>({...v,[id]:value}));
 const apply=(preset:ExportValues)=>setValues(v=>({...v,...preset,name:v.name}));
 const run=async()=>{
  if(e.working)return;setErrorKey(null);setSlidesExportState({working:true});
  try{const o=valuesToSlidesOptions(values);await saveSlidesCopyAdvanced(o.name||base(),{title:o.metaTitle,author:o.metaAuthor,description:o.metaDescription});setSlidesExportState({open:false});}
  catch(err){setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));}
  finally{setSlidesExportState({working:false});}
 };
 return <AdvancedExportDialog open={e.open&&!!s.name} onClose={()=>setSlidesExportState({open:false})} schema={schema} values={values} onChange={change} onApply={apply} preview={null} rendering={false} busy={e.working} errorKey={errorKey} errorDetail={errorDetail} onExport={()=>void run()} contentTestId="slides-export-advanced"/>;
}
