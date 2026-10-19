import {useEffect,useMemo,useState} from 'react';
import {setStudio3DExportAdvanced,useStudio3DExportAdvanced} from '../../lib/studio3d/exportAdvancedState';
import {useStudio3D} from '../../lib/studio3d/session';
import {studio3DExportPlan,studio3DExportSchema,studio3DOptionsToValues,valuesToStudio3DOptions,STUDIO3D_EXPORT_DEFAULTS,STUDIO3D_RENDER_MAX} from '../../lib/studio3d/exportAdvanced';
import {commandDispatcher} from '../../lib/commandDispatcher';
import type {ExportValues,ExportValue} from '../../lib/export/schema';
import {AdvancedExportDialog} from '../export/AdvancedExportDialog';
/** Studio-owned host: opens the shared Advanced Export dialog for 3D (AE2). Every export runs through the registered studio3d.* commands. */
export function Studio3DExportAdvanced(){
 const open=useStudio3DExportAdvanced();const s=useStudio3D();
 const selected=s.marked.length||(s.selected!=null?1:0);
 const schema=useMemo(()=>studio3DExportSchema({selected,hasContent:s.stats.meshes>0||s.stats.nodes>0,maxRender:STUDIO3D_RENDER_MAX}),[selected,s.stats.meshes,s.stats.nodes]);
 const [values,setValues]=useState<ExportValues>(()=>studio3DOptionsToValues(STUDIO3D_EXPORT_DEFAULTS));
 const [working,setWorking]=useState(false);const [errorKey,setErrorKey]=useState<string|null>(null);const [errorDetail,setErrorDetail]=useState('');
 // Seed once per opening from the session so the dialog starts where the panels are.
 useEffect(()=>{
  if(!open)return;
  const base=(s.name||'scene').replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'')||'scene';
  setValues(studio3DOptionsToValues({...STUDIO3D_EXPORT_DEFAULTS,name:base,textures:s.exportTextures,selectionOnly:s.exportSelection,unit:s.unit}));setErrorKey(null);
 },[open]);
 useEffect(()=>()=>setStudio3DExportAdvanced(false),[]);
 const change=(id:string,value:ExportValue)=>setValues(v=>({...v,[id]:value}));
 const apply=(preset:ExportValues)=>setValues(v=>({...v,...preset,name:v.name}));
 const run=async()=>{
  if(working)return;setErrorKey(null);setWorking(true);
  try{for(const step of studio3DExportPlan(valuesToStudio3DOptions(values)))await commandDispatcher.runCommand(step.id,step.payload,{origin:'ui'});setStudio3DExportAdvanced(false);}
  catch(err){setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));}
  finally{setWorking(false);}
 };
 return <AdvancedExportDialog open={open&&s.status==='ready'} onClose={()=>setStudio3DExportAdvanced(false)} schema={schema} values={values} onChange={change} onApply={apply} preview={null} rendering={false} busy={working} errorKey={errorKey} errorDetail={errorDetail} onExport={()=>void run()} contentTestId="studio3d-export-advanced"/>;
}
