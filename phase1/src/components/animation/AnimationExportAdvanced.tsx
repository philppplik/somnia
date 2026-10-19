import {useEffect,useMemo,useState} from 'react';
import {setAnimationExportAdvanced,useAnimationExportAdvanced} from '../../lib/animation/exportAdvancedState';
import {animationSession,useAnimationState} from '../../lib/animation/session';
import {findComp} from '../../lib/animation/model';
import {cancelExport,exportApng,exportCurrentFrame,exportGif,exportSpriteSheet,exportWebM,exportWorkAreaSequence,exportState,setExportSettings,setExportTransparent,useExportState} from '../../lib/animation/exportJob';
import {animationExportSchema,animationFileStem,animationOptionsToValues,animationSettings,animationTransparent,valuesToAnimationOptions,ANIMATION_EXPORT_DEFAULTS,type AnimationAdvancedOptions} from '../../lib/animation/exportAdvanced';
import {layerSetIds} from '../../lib/animation/layerSet';
import type {ExportValues,ExportValue} from '../../lib/export/schema';
import {AdvancedExportDialog} from '../export/AdvancedExportDialog';
const START:Record<string,(o:AnimationAdvancedOptions)=>Promise<unknown>>={
 png:()=>exportCurrentFrame(),jpeg:()=>exportCurrentFrame(),webp:()=>exportCurrentFrame(),sequence:()=>exportWorkAreaSequence(),
 gif:()=>exportGif(),apng:()=>exportApng(),webm:()=>exportWebM(),sheet:o=>exportSpriteSheet(o.columns||undefined),
};
/** Studio-owned host: opens the shared Advanced Export dialog for Animation (AE2). Writes the same session settings as the Render setup panel, then runs the normal export. */
export function AnimationExportAdvanced(){
 const open=useAnimationExportAdvanced();const s=useAnimationState();const job=useExportState();
 const comp=s.doc?findComp(s.doc)??null:null;
 const selected=layerSetIds(s.view.selectedLayer).length;
 const schema=useMemo(()=>animationExportSchema({comp,selected}),[comp,selected]);
 const [values,setValues]=useState<ExportValues>(()=>animationOptionsToValues(ANIMATION_EXPORT_DEFAULTS));
 const [errorKey,setErrorKey]=useState<string|null>(null);const [errorDetail,setErrorDetail]=useState('');
 // Seed once per opening from the panel's current settings so the dialog starts where the panel is.
 useEffect(()=>{
  if(!open)return;const cur=exportState().settings,doc=animationSession().document;
  const c=doc&&findComp(doc);const frames=c?Math.max(1,Math.round(c.duration*c.fps.num/(c.fps.den*1e6))):1;
  setValues(animationOptionsToValues({...ANIMATION_EXPORT_DEFAULTS,name:animationFileStem(cur.fileName||doc?.name||'animation')||'animation',
   output:cur.frameFormat&&cur.frameFormat!=='png'?cur.frameFormat:ANIMATION_EXPORT_DEFAULTS.output,scale:cur.scale,fps:cur.fps??0,useRange:cur.from!==null||cur.to!==null,rangeStart:cur.from??0,rangeEnd:cur.to??frames-1,
   transparent:exportState().transparent,loop:cur.loop!==false,loopSeam:!!cur.loopSeam,colors:cur.colors??256,dither:!!cur.dither,webmQuality:cur.quality??'medium',columns:cur.columns??0,padding:cur.sheetPadding??0,frameQuality:cur.frameQuality??90,selectedOnly:!!cur.selectedOnly}));
  setErrorKey(null);
 },[open]);
 useEffect(()=>()=>setAnimationExportAdvanced(false),[]);
 const running=job.status==='running';
 const change=(id:string,value:ExportValue)=>setValues(v=>({...v,[id]:value}));
 const apply=(preset:ExportValues)=>setValues(v=>({...v,...preset,name:v.name}));
 const run=async()=>{
  if(running)return;setErrorKey(null);
  try{
   const o=valuesToAnimationOptions(values);
   setExportSettings({...animationSettings(o),fileName:animationFileStem(o.name)});setExportTransparent(animationTransparent(o));
   await START[o.output](o);setAnimationExportAdvanced(false);
  }catch(err){setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));}
 };
 return <AdvancedExportDialog open={open&&!!comp} onClose={()=>setAnimationExportAdvanced(false)} schema={schema} values={values} onChange={change} onApply={apply} preview={null} rendering={false} busy={running} progress={running&&job.total?job.done/job.total:null} onStop={cancelExport} errorKey={errorKey} errorDetail={errorDetail} onExport={()=>void run()}/>;
}
