import {useEffect,useMemo,useState} from 'react';
import {setVideoExportAdvanced,useVideoExportAdvanced} from '../../lib/video/exportAdvancedState';
import {cancelVideoExport,exportVideoFile,getVideoSession,setVideoExportOptions,setVideoExportRange,setVideoFormat,useVideoSession,videoTimelineDuration} from '../../lib/video/session';
import {videoExportFileName,videoExportSchema,videoOptionsToValues,videoSessionPatch,valuesToVideoOptions,VIDEO_EXPORT_DEFAULTS} from '../../lib/video/exportAdvanced';
import {needsSourceFile} from '../../lib/video/titles';
import {useMedia} from '../../lib/media';
import type {ExportValues,ExportValue} from '../../lib/export/schema';
import {AdvancedExportDialog} from '../export/AdvancedExportDialog';
/** Studio-owned host: opens the shared Advanced Export dialog for Video (AE2). Writes the same session options as the export panel, then runs the normal export. */
export function VideoExportAdvanced(){
 const name=useVideoExportAdvanced();const s=useVideoSession(name);const media=useMedia();
 const total=videoTimelineDuration(s);
 const missing=!!s&&s.clips.some(c=>needsSourceFile(c)&&!media.items.some(i=>i.name===c.source));
 const caps=s?.capabilities;
 const audible=!!s&&s.clips.some(c=>needsSourceFile(c)&&!c.muted&&c.gain>0&&!!getVideoSession(c.source)?.probe?.audio);
 const schema=useMemo(()=>videoExportSchema({total,formats:{webm:!!caps?.webmVideo,mp4:!!caps?.mp4Video},silent:f=>audible&&!(f==='mp4'?caps?.aac:caps?.opus),hasClips:!!s?.clips.length&&!missing}),[total,caps,audible,s?.clips.length,missing]);
 const [values,setValues]=useState<ExportValues>(()=>videoOptionsToValues(VIDEO_EXPORT_DEFAULTS));
 const [errorKey,setErrorKey]=useState<string|null>(null);const [errorDetail,setErrorDetail]=useState('');
 // Seed once per opening from the session's current options so the dialog starts where the panel is.
 useEffect(()=>{
  if(!name)return;const cur=getVideoSession(name);if(!cur)return;
  const base=name.replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'');
  setValues(videoOptionsToValues({...VIDEO_EXPORT_DEFAULTS,name:base,format:cur.format,scale:cur.exportOptions.scale,quality:cur.exportOptions.quality,aspect:cur.exportOptions.aspect,fps:cur.exportOptions.fps??0,useRange:!!cur.exportRange,rangeStart:cur.exportRange?.start??0,rangeEnd:cur.exportRange?.end??videoTimelineDuration(cur)}));
  setErrorKey(null);
 },[name]);
 useEffect(()=>()=>setVideoExportAdvanced(null),[]);
 // Another file became active: close instead of exporting a different timeline.
 useEffect(()=>{if(name&&media.active!==name&&getVideoSession(name)?.status!=='exporting')setVideoExportAdvanced(null);},[name,media.active]);
 const exporting=s?.status==='exporting';
 const change=(id:string,value:ExportValue)=>setValues(v=>({...v,[id]:value}));
 const apply=(preset:ExportValues)=>setValues(v=>({...v,...preset,name:v.name}));
 const run=async()=>{
  if(!name||exporting)return;setErrorKey(null);
  try{
   const o=valuesToVideoOptions(values),p=videoSessionPatch(o,total);
   setVideoFormat(name,p.format);setVideoExportOptions(name,p.options);setVideoExportRange(name,p.range);
   const outcome=await exportVideoFile(name,videoExportFileName(o.name,o.format));
   if(outcome==='downloaded')setVideoExportAdvanced(null);
   else if(outcome==='unavailable'){setErrorKey('export.error.render');setErrorDetail(getVideoSession(name)?.error||'Export unavailable.');}
  }catch(err){setErrorKey('export.error.render');setErrorDetail(err instanceof Error?err.message:String(err));}
 };
 return <AdvancedExportDialog open={!!name&&!!s} onClose={()=>setVideoExportAdvanced(null)} schema={schema} values={values} onChange={change} onApply={apply} preview={null} rendering={false} busy={!!exporting} progress={s?.progress?.ratio??null} onStop={()=>name&&cancelVideoExport(name)} errorKey={errorKey} errorDetail={errorDetail} onExport={()=>void run()} contentTestId="video-export-advanced"/>;
}
