import {useEffect,useMemo,useState} from 'react';
import {setDesignExportAdvancedOpen,useDesignExportAdvancedOpen} from '../../lib/design/exportState';
import {downloadArtboardsAdvanced,exportName} from '../../lib/design/exportArtboards';
import {useDesignState} from '../../lib/design/session';
import {designExportSchema,designOptionsToValues,valuesToDesignOptions,DESIGN_EXPORT_DEFAULTS} from '../../lib/design/designExportSchema';
import type {ExportValues,ExportValue} from '../../lib/export/schema';
import {AdvancedExportDialog} from '../export/AdvancedExportDialog';
/** Studio-owned host: opens the shared Advanced Export dialog for Design (AE1) — scope, file name and SVG title/description metadata. */
export function DesignExportAdvanced(){
 const s=useDesignState();const open=useDesignExportAdvancedOpen();
 const schema=useMemo(()=>designExportSchema(),[]);
 const board=s.document?.artboards.find(b=>b.id===s.artboardId);
 const base=()=>board?.name??s.document?.name??'';
 const [values,setValues]=useState<ExportValues>(()=>({...designOptionsToValues(DESIGN_EXPORT_DEFAULTS)}));
 const [errorKey,setErrorKey]=useState<string|null>(null);const [errorDetail,setErrorDetail]=useState('');const [working,setWorking]=useState(false);
 useEffect(()=>{if(open)setValues(v=>({...v,name:v.name||base()}));},[open]);
 useEffect(()=>()=>setDesignExportAdvancedOpen(false),[]);
 const change=(id:string,value:ExportValue)=>setValues(v=>({...v,[id]:value}));
 const apply=(preset:ExportValues)=>setValues(v=>({...v,...preset,name:v.name}));
 const run=()=>{
  if(working||!s.document)return;setErrorKey(null);setWorking(true);
  try{
   const o=valuesToDesignOptions(values);
   downloadArtboardsAdvanced(s.document,o.scope,s.artboardId??'',exportName(o.name||base()),{title:o.metaTitle,description:o.metaDescription});
   setDesignExportAdvancedOpen(false);
  }catch(err){setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));}
  finally{setWorking(false);}
 };
 return <AdvancedExportDialog open={open&&!!s.document} onClose={()=>setDesignExportAdvancedOpen(false)} schema={schema} values={values} onChange={change} onApply={apply} preview={null} rendering={false} busy={working} errorKey={errorKey} errorDetail={errorDetail} onExport={run} contentTestId="design-export-advanced"/>;
}
