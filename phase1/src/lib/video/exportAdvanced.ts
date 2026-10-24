import type {ExportSchema,ExportValues} from '../export/schema';
import {EXPORT_ASPECTS,EXPORT_FPS_CAPS,EXPORT_QUALITIES,EXPORT_SCALES,type VideoAspect,type VideoExportOptions,type VideoExportQuality,type VideoFormat} from './recipe';
import {MIN_CLIP_SECONDS} from './timeline';
/** Video options for the shared Advanced Export dialog (AE2). They are the same session options the export panel edits. */
export interface VideoAdvancedOptions{
 name:string;format:VideoFormat;scale:number;quality:VideoExportQuality;aspect:VideoAspect;fps:number;
 useRange:boolean;rangeStart:number;rangeEnd:number;silentOk:boolean;
}
export const VIDEO_EXPORT_DEFAULTS:VideoAdvancedOptions={name:'',format:'webm',scale:1,quality:'high',aspect:'source',fps:0,useRange:false,rangeStart:0,rangeEnd:0,silentOk:false};
/** What the host knows about the open timeline; the schema stays pure. */
export interface VideoExportContext{
 /** Timeline length in seconds. */
 total:number;
 /** Encoders the browser offers. */
 formats:{webm:boolean;mp4:boolean};
 /** True when the timeline has audible audio but the chosen format has no audio encoder here. */
 silent:(format:VideoFormat)=>boolean;
 hasClips:boolean;
}
export function valuesToVideoOptions(values:ExportValues):VideoAdvancedOptions{
 const d=VIDEO_EXPORT_DEFAULTS;const str=(k:string,f:string)=>typeof values[k]==='string'?values[k] as string:f;
 const num=(k:string,f:number)=>{const v=typeof values[k]==='string'&&values[k]!==''?Number(values[k]):values[k];return typeof v==='number'&&Number.isFinite(v)?v:f;};
 const scale=num('scale',d.scale),fps=num('fps',d.fps),aspect=str('aspect',d.aspect),quality=str('quality',d.quality);
 return {
  name:str('name','').trim(),format:str('format',d.format)==='mp4'?'mp4':'webm',
  scale:(EXPORT_SCALES as readonly number[]).includes(scale)?scale:1,
  quality:(EXPORT_QUALITIES as readonly string[]).includes(quality)?quality as VideoExportQuality:'high',
  aspect:(EXPORT_ASPECTS as string[]).includes(aspect)?aspect as VideoAspect:'source',
  fps:(EXPORT_FPS_CAPS as readonly number[]).includes(fps)?fps:0,
  useRange:values.useRange===true,rangeStart:num('rangeStart',0),rangeEnd:num('rangeEnd',0),silentOk:values.silentOk===true,
 };
}
export const videoOptionsToValues=(o:VideoAdvancedOptions):ExportValues=>({...o,scale:String(o.scale),fps:String(o.fps)});
/** Session patch for the options: the export panel and the dialog write the same fields. */
export function videoSessionPatch(o:VideoAdvancedOptions,total:number):{format:VideoFormat;options:VideoExportOptions;range:{start:number;end:number}|null}{
 const range=o.useRange&&o.rangeEnd-o.rangeStart>=MIN_CLIP_SECONDS?{start:o.rangeStart,end:Math.min(o.rangeEnd,total)}:null;
 return {format:o.format,options:{scale:o.scale,quality:o.quality,fps:o.fps||null,aspect:o.aspect},range};
}
export const videoExportFileName=(name:string,format:VideoFormat)=>((name.replace(/\.(webm|mp4)$/i,'').replace(/[\\/:*?"<>|]/g,'_').trim()||'video')+'.'+format);
export function videoExportSchema(ctx:VideoExportContext):ExportSchema{
 const formats=(['webm','mp4'] as const).filter(f=>ctx.formats[f]);
 return {studio:'video',defaults:videoOptionsToValues({...VIDEO_EXPORT_DEFAULTS,format:formats[0]??'webm',rangeEnd:ctx.total}),validate:values=>{
  const o=valuesToVideoOptions(values);
  if(!ctx.hasClips)return 'export.error.empty';
  if(!ctx.formats[o.format])return 'export.error.format';
  if(!o.name)return 'export.error.name';
  if(o.useRange&&(o.rangeStart<0||o.rangeEnd>ctx.total+1e-6||o.rangeEnd-o.rangeStart<MIN_CLIP_SECONDS))return 'export.error.range';
  if(ctx.silent(o.format)&&!o.silentOk)return 'export.error.silent';
  return null;
 },fields:[
  {id:'format',type:'select',labelKey:'export.format',options:(formats.length?formats:['webm' as const]).map(f=>({value:f,labelKey:f==='webm'?'WebM':'MP4'}))},
  {id:'name',type:'text',labelKey:'export.name',maxLength:120},
  {id:'scale',type:'select',labelKey:'export.resolution',group:'export.group.video',options:EXPORT_SCALES.map(s=>({value:String(s),labelKey:`${Math.round(s*100)}%`}))},
  {id:'aspect',type:'select',labelKey:'export.aspect',group:'export.group.video',options:EXPORT_ASPECTS.map(a=>({value:a,labelKey:a==='source'?'export.aspect.source':a}))},
  {id:'fps',type:'select',labelKey:'export.fps',group:'export.group.video',options:[{value:'0',labelKey:'export.fps.native'},...EXPORT_FPS_CAPS.map(f=>({value:String(f),labelKey:`${f} fps`}))]},
  {id:'quality',type:'select',labelKey:'export.quality',group:'export.group.video',options:EXPORT_QUALITIES.map(q=>({value:q,labelKey:'export.quality.'+q}))},
  {id:'useRange',type:'checkbox',labelKey:'export.range.use',group:'export.group.range'},
  {id:'rangeStart',type:'number',labelKey:'export.range.start',group:'export.group.range',min:0,max:ctx.total,step:0.1,unit:'s',visibleWhen:v=>v.useRange===true},
  {id:'rangeEnd',type:'number',labelKey:'export.range.end',group:'export.group.range',min:0,max:ctx.total,step:0.1,unit:'s',visibleWhen:v=>v.useRange===true},
  {id:'silentOk',type:'checkbox',labelKey:'export.silentAck',group:'export.group.range',visibleWhen:v=>ctx.silent(v.format==='mp4'?'mp4':'webm')},
 ]};
}
