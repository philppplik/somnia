import type {ExportSchema,ExportValues} from '../export/schema';
import type {Composition} from './model';
import {exportPlan,settingsProblems,EXPORT_LIMITS,FRAME_FORMATS,GIF_COLORS,WEBM_QUALITIES,type ExportFormat,type ExportSettings,type FrameFormat,type GifColors,type WebmQuality} from './exportSettings';
/** Animation options for the shared Advanced Export dialog (AE2). They are the same session settings the Render setup panel edits. */
export type AnimationOutput='png'|'jpeg'|'webp'|'sequence'|'gif'|'apng'|'webm'|'sheet';
export const ANIMATION_OUTPUTS:readonly AnimationOutput[]=['png','jpeg','webp','sequence','gif','apng','webm','sheet'];
export const ANIMATION_FPS_CHOICES=[0,12,15,24,25,30,50,60] as const;
export interface AnimationAdvancedOptions{
 name:string;output:AnimationOutput;scale:number;fps:number;useRange:boolean;rangeStart:number;rangeEnd:number;
 transparent:boolean;loop:boolean;loopSeam:boolean;colors:GifColors;dither:boolean;webmQuality:WebmQuality;
 columns:number;padding:number;frameQuality:number;selectedOnly:boolean;
}
export const ANIMATION_EXPORT_DEFAULTS:AnimationAdvancedOptions={name:'',output:'gif',scale:100,fps:0,useRange:false,rangeStart:0,rangeEnd:0,transparent:false,loop:true,loopSeam:false,colors:256,dither:false,webmQuality:'medium',columns:0,padding:0,frameQuality:90,selectedOnly:false};
/** The panel's format for an output: stills use the single-frame export. */
export const isStill=(o:AnimationOutput)=>o==='png'||o==='jpeg'||o==='webp';
export const outputFormat=(o:AnimationOutput):ExportFormat|null=>isStill(o)?null:o as ExportFormat;
const ALPHA:readonly AnimationOutput[]=['png','webp','sequence','apng','sheet'];
export const hasAlpha=(o:AnimationOutput)=>ALPHA.includes(o);
export interface AnimationExportContext{
 /** The open composition, or null when nothing is open. */
 comp:Composition|null;
 /** Layers selected when the dialog opens (for the selected-only switch). */
 selected:number;
}
export function valuesToAnimationOptions(values:ExportValues):AnimationAdvancedOptions{
 const d=ANIMATION_EXPORT_DEFAULTS;const str=(k:string,f:string)=>typeof values[k]==='string'?values[k] as string:f;
 const num=(k:string,f:number)=>{const v=typeof values[k]==='string'&&values[k]!==''?Number(values[k]):values[k];return typeof v==='number'&&Number.isFinite(v)?v:f;};
 const out=str('output',d.output),colors=num('colors',d.colors),q=str('webmQuality',d.webmQuality),fps=num('fps',0);
 return {
  name:str('name','').trim(),output:(ANIMATION_OUTPUTS as readonly string[]).includes(out)?out as AnimationOutput:'gif',
  scale:Math.round(num('scale',d.scale)),fps:(ANIMATION_FPS_CHOICES as readonly number[]).includes(fps)?fps:0,
  useRange:values.useRange===true,rangeStart:Math.round(num('rangeStart',0)),rangeEnd:Math.round(num('rangeEnd',0)),
  transparent:values.transparent===true,loop:values.loop!==false,loopSeam:values.loopSeam===true,
  colors:(GIF_COLORS as readonly number[]).includes(colors)?colors as GifColors:256,dither:values.dither===true,
  webmQuality:(WEBM_QUALITIES as readonly string[]).includes(q)?q as WebmQuality:'medium',
  columns:Math.round(num('columns',0)),padding:Math.round(num('padding',0)),frameQuality:Math.round(num('frameQuality',d.frameQuality)),selectedOnly:values.selectedOnly===true,
 };
}
export const animationOptionsToValues=(o:AnimationAdvancedOptions):ExportValues=>({...o,colors:String(o.colors),fps:String(o.fps)});
/** Session settings for the options. Crop, background, blur and first number stay as the panel has them. */
export function animationSettings(o:AnimationAdvancedOptions):Partial<ExportSettings>{
 const fmt:FrameFormat|undefined=isStill(o.output)?(o.output as FrameFormat):undefined;
 return {scale:o.scale,fps:o.fps||null,from:o.useRange&&!isStill(o.output)?o.rangeStart:null,to:o.useRange&&!isStill(o.output)?o.rangeEnd:null,fileName:o.name,
  quality:o.webmQuality,colors:o.colors,dither:o.dither,loop:o.loop,loopSeam:o.loopSeam,columns:o.columns||null,sheetPadding:o.padding,
  frameFormat:fmt??'png',frameQuality:o.frameQuality,selectedOnly:o.selectedOnly};
}
/** Opaque outputs ignore the transparency switch, so the session flag is only on where the format can carry alpha. */
export const animationTransparent=(o:AnimationAdvancedOptions)=>hasAlpha(o.output)&&o.transparent;
export const animationFileStem=(name:string)=>name.replace(/\.(png|jpe?g|webp|gif|apng|webm|zip)$/i,'').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^[._]+/,'').slice(0,80);
/** Why the export cannot run, as an i18n key, or null. */
export function animationProblem(o:AnimationAdvancedOptions,comp:Composition|null,selected:number):string|null{
 if(!comp)return 'export.error.empty';
 if(!animationFileStem(o.name))return 'export.error.name';
 if(o.selectedOnly&&selected<1)return 'export.error.selection';
 const s={...animationSettings(o),fileName:animationFileStem(o.name)} as ExportSettings;
 if(settingsProblems({...s,from:s.from??null,to:s.to??null,fps:s.fps??null}).length)return 'export.error.animation';
 if(!isStill(o.output)&&exportPlan(comp,o.output as ExportFormat,{...s,from:s.from??null,to:s.to??null,fps:s.fps??null}).problems.length)return 'export.error.animation';
 return null;
}
export function animationExportSchema(ctx:AnimationExportContext):ExportSchema{
 const frames=ctx.comp?Math.max(1,Math.round(ctx.comp.duration*ctx.comp.fps.num/(ctx.comp.fps.den*1e6))):1;
 const out=(v:ExportValues)=>valuesToAnimationOptions(v).output;const anim=(v:ExportValues)=>!isStill(out(v));
 return {studio:'animation',defaults:animationOptionsToValues({...ANIMATION_EXPORT_DEFAULTS,rangeEnd:frames-1}),validate:v=>animationProblem(valuesToAnimationOptions(v),ctx.comp,ctx.selected),fields:[
  {id:'output',type:'select',labelKey:'export.format',options:[
   {value:'png',labelKey:'export.anim.png'},{value:'jpeg',labelKey:'export.anim.jpeg'},{value:'webp',labelKey:'export.anim.webp'},{value:'sequence',labelKey:'export.anim.sequence'},
   {value:'gif',labelKey:'GIF'},{value:'apng',labelKey:'APNG'},{value:'webm',labelKey:'WebM'},{value:'sheet',labelKey:'export.anim.sheet'}]},
  {id:'name',type:'text',labelKey:'export.name',maxLength:80},
  {id:'scale',type:'number',labelKey:'export.scalePercent',group:'export.group.size',min:10,max:400,step:5,unit:'%'},
  {id:'fps',type:'select',labelKey:'export.fps',group:'export.group.video',visibleWhen:anim,options:ANIMATION_FPS_CHOICES.map(f=>({value:String(f),labelKey:f?`${f} fps`:'export.fps.native'}))},
  {id:'webmQuality',type:'select',labelKey:'export.quality',group:'export.group.video',visibleWhen:v=>out(v)==='webm',options:WEBM_QUALITIES.map(q=>({value:q,labelKey:'export.quality.'+q}))},
  {id:'frameQuality',type:'number',labelKey:'export.quality',group:'export.group.output',min:1,max:100,step:1,unit:'%',visibleWhen:v=>out(v)==='jpeg'||out(v)==='webp'},
  {id:'transparent',type:'checkbox',labelKey:'export.transparent',group:'export.group.output',visibleWhen:v=>hasAlpha(out(v))},
  {id:'colors',type:'select',labelKey:'export.colors',group:'export.group.output',visibleWhen:v=>out(v)==='gif',options:GIF_COLORS.map(c=>({value:String(c),labelKey:String(c)}))},
  {id:'dither',type:'checkbox',labelKey:'export.dither',group:'export.group.output',visibleWhen:v=>out(v)==='gif'},
  {id:'loop',type:'checkbox',labelKey:'export.loop',group:'export.group.output',visibleWhen:v=>out(v)==='gif'||out(v)==='apng'},
  {id:'loopSeam',type:'checkbox',labelKey:'export.loopSeam',group:'export.group.output',visibleWhen:v=>out(v)==='gif'||out(v)==='apng'},
  {id:'columns',type:'number',labelKey:'export.columns',group:'export.group.output',min:0,max:256,step:1,visibleWhen:v=>out(v)==='sheet'},
  {id:'padding',type:'number',labelKey:'export.padding',group:'export.group.output',min:0,max:32,step:1,unit:'px',visibleWhen:v=>out(v)==='sheet'},
  {id:'selectedOnly',type:'checkbox',labelKey:'export.selectedOnly',group:'export.group.output'},
  {id:'useRange',type:'checkbox',labelKey:'export.range.use',group:'export.group.range',visibleWhen:anim},
  {id:'rangeStart',type:'number',labelKey:'export.range.start',group:'export.group.range',min:0,max:frames-1,step:1,unit:'f',visibleWhen:v=>anim(v)&&v.useRange===true},
  {id:'rangeEnd',type:'number',labelKey:'export.range.end',group:'export.group.range',min:0,max:frames-1,step:1,unit:'f',visibleWhen:v=>anim(v)&&v.useRange===true},
 ]};
}
