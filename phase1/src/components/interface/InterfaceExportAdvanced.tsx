import {useEffect,useMemo,useState} from 'react';
import {setInterfaceExportAdvancedOpen,useInterfaceExportAdvancedOpen} from '../../lib/interface/exportAdvancedState';
import {interfaceExportSchema,interfaceOptionsToValues,valuesToInterfaceOptions,injectInterfaceSvgMeta,INTERFACE_EXPORT_DEFAULTS} from '../../lib/interface/interfaceExportSchema';
import {useInterfaceState} from '../../lib/interface/session';
import {freezeInterfaceExport,INTERFACE_EXPORT_PRESETS,frameExportPNG,downloadInterfaceBlob} from '../../lib/interface/export';
import type {ExportValues,ExportValue} from '../../lib/export/schema';
import {AdvancedExportDialog} from '../export/AdvancedExportDialog';
/** Studio-owned host: opens the shared Advanced Export dialog for Interface (AE1) — name, frame scope, format/scale and SVG metadata. */
export function InterfaceExportAdvanced(){
 const s=useInterfaceState();const open=useInterfaceExportAdvancedOpen();
 const schema=useMemo(()=>interfaceExportSchema(),[]);
 const base=()=>s.document?.name??'';
 const [values,setValues]=useState<ExportValues>(()=>({...interfaceOptionsToValues(INTERFACE_EXPORT_DEFAULTS)}));
 const [errorKey,setErrorKey]=useState<string|null>(null);const [errorDetail,setErrorDetail]=useState('');const [working,setWorking]=useState(false);
 useEffect(()=>{if(open)setValues(v=>({...v,name:v.name||base()}));},[open]);
 useEffect(()=>()=>setInterfaceExportAdvancedOpen(false),[]);
 const change=(id:string,value:ExportValue)=>setValues(v=>({...v,[id]:value}));
 const apply=(preset:ExportValues)=>setValues(v=>({...v,...preset,name:v.name}));
 const run=async()=>{
  if(working||!s.document)return;setErrorKey(null);setWorking(true);
  try{
   const o=valuesToInterfaceOptions(values);
   const doc=s.document;
   const frameIds=o.scope==='page'?doc.nodes.filter(n=>n.pageId===s.pageId&&n.kind==='frame'&&!n.hidden).map(n=>n.id):s.selectedIds.filter(id=>doc.nodes.find(n=>n.id===id)?.kind==='frame');
   if(!frameIds.length)throw Error('Select at least one frame.');
   const preset=INTERFACE_EXPORT_PRESETS[o.preset];if(!preset)throw Error('Unsupported export preset.');
   const review=freezeInterfaceExport(doc,frameIds,preset);
   const baseName=o.name||base();
   for(let i=0;i<review.frames.length;i++){
    const frame=review.frames[i];const suffix=review.frames.length>1?`-${i+1}`:'';
    if(preset.format==='svg')downloadInterfaceBlob(new Blob([injectInterfaceSvgMeta(frame.svg,o.metaTitle,o.metaDescription)],{type:'image/svg+xml'}),`${baseName}${suffix}.svg`);
    else downloadInterfaceBlob(await frameExportPNG(frame,preset.scale),`${baseName}${suffix}@${preset.scale}x.png`);
   }
   setInterfaceExportAdvancedOpen(false);
  }catch(err){setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));}
  finally{setWorking(false);}
 };
 return <AdvancedExportDialog open={open&&!!s.document} onClose={()=>setInterfaceExportAdvancedOpen(false)} schema={schema} values={values} onChange={change} onApply={apply} preview={null} rendering={false} busy={working} errorKey={errorKey} errorDetail={errorDetail} onExport={()=>void run()} contentTestId="interface-export-advanced"/>;
}
