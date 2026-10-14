import type {Composition} from './model';
import {sheetPlan,SheetError} from './spriteSheet';
import {TICKS_PER_SECOND,frameToTick,tickToFrame} from './time';
/**
 * Export settings and the pure plan derived from them: output size, frame range, frame rate, frame count, duration and a rough size
 * estimate. Settings are session state, not document data, so they have no undo step and are not saved with the file.
 * The plan carries a derived composition (new rate and range, same drawing size) that the existing export builders can use as is.
 */
export type ExportFormat='sequence'|'gif'|'apng'|'webm'|'sheet';
export const EXPORT_FORMATS:readonly ExportFormat[]=['sequence','gif','apng','webm','sheet'];
/** Same limits as exportFrames, gifEncode, apngEncode and exportVideo (a test keeps them in step). */
export const EXPORT_LIMITS={maxFrames:1800,gifFrames:300,webmSeconds:60,maxPixels:8192*8192,maxBytes:64*1024*1024};
export type WebmQuality='low'|'medium'|'high';
export const WEBM_QUALITIES:readonly WebmQuality[]=['low','medium','high'];
const WEBM_BPP:Record<WebmQuality,number>={low:0.035,medium:0.07,high:0.14};
/** Target video bitrate for the recorder, bits per second, clamped to 250 kbit/s .. 40 Mbit/s. */
export const webmBitrate=(width:number,height:number,fps:number,q:WebmQuality='medium')=>Math.round(Math.min(40e6,Math.max(250e3,width*height*fps*WEBM_BPP[q])));
export const SCALE_MIN=10,SCALE_MAX=400,FPS_MAX=60;
export interface ExportSettings{
 /** Output size as a percentage of the composition, 10 to 400. */
 scale:number;
 /** Output frames per second, whole number 1 to 60, or null for the composition rate. */
 fps:number|null;
 /** First and last frame (inclusive, counted from the composition start like the file names), or null for the work area. */
 from:number|null;to:number|null;
 /** Sprite sheet columns, 1 to 256, or null/absent for the near-square grid. */
 columns?:number|null;
 /** GIF only: Floyd-Steinberg dithering. Off or absent keeps the plain palette mapping. */
 dither?:boolean;
 /** GIF and APNG: false plays once, absent or true loops forever. */
 loop?:boolean;
 /** Base name of the exported files (cleaned to letters, digits, dot, dash, underscore). Empty or absent uses the document name. */
 fileName?:string|null;
 /** WebM only: video quality, low/medium/high bits per pixel. Absent means medium. */
 quality?:WebmQuality;
 /** Background colour (#rrggbb) for opaque exports instead of the composition's. Absent or null keeps the composition background. */
 background?:string|null;
 /** PNG sequence: file number of the first frame, 0 to 99999. Null or absent keeps the composition frame numbers. */
 firstNumber?:number|null;
}
export const defaultExportSettings=():ExportSettings=>({scale:100,fps:null,from:null,to:null});
export interface ExportPreset{id:string;format:ExportFormat;scale:number;fps:number|null;transparent:boolean}
export const EXPORT_PRESETS:readonly ExportPreset[]=[
 {id:'web-gif',format:'gif',scale:50,fps:15,transparent:false},
 {id:'small-gif',format:'gif',scale:25,fps:12,transparent:false},
 {id:'social-webm',format:'webm',scale:100,fps:30,transparent:false},
 {id:'alpha-apng',format:'apng',scale:100,fps:null,transparent:true},
 {id:'frames-png',format:'sequence',scale:100,fps:null,transparent:true},
 {id:'frames-2x',format:'sequence',scale:200,fps:null,transparent:false},
];
export type ExportProblem='number'|'background'|'quality'|'size'|'frames'|'seconds'|'range'|'scale'|'fps'|'columns'|'name';
export interface ExportPlan{
 format:ExportFormat;width:number;height:number;frames:number;seconds:number;fps:{num:number;den:number};
 /** Frame range at the composition rate, inclusive. */
 from:number;to:number;
 /** Composition with the export rate and range; drawing size is unchanged, output size is `width` x `height`. */
 comp:Composition;
 estimateBytes:number;overCap:boolean;problems:ExportProblem[];
}
const whole=(n:unknown,lo:number,hi:number)=>typeof n==='number'&&Number.isInteger(n)&&n>=lo&&n<=hi;
/** Problems with the raw settings, independent of any composition. */
export function settingsProblems(s:ExportSettings):ExportProblem[]{
 const p:ExportProblem[]=[];
 if(!whole(s.scale,SCALE_MIN,SCALE_MAX))p.push('scale');
 if(s.fps!==null&&!whole(s.fps,1,FPS_MAX))p.push('fps');
 if((s.from!==null&&!whole(s.from,0,1e7))||(s.to!==null&&!whole(s.to,0,1e7))||(s.from!==null&&s.to!==null&&s.to<s.from))p.push('range');
 if(s.columns!==undefined&&s.columns!==null&&!whole(s.columns,1,256))p.push('columns');
 if(s.fileName!==undefined&&s.fileName!==null&&(typeof s.fileName!=='string'||s.fileName.length>80))p.push('name');
 if(s.firstNumber!==undefined&&s.firstNumber!==null&&!whole(s.firstNumber,0,99999))p.push('number');
 if(s.background!==undefined&&s.background!==null&&!/^#[0-9a-fA-F]{6}$/.test(s.background))p.push('background');
 if(s.quality!==undefined&&!WEBM_QUALITIES.includes(s.quality))p.push('quality');
 return p;
}
const BYTES_PER_PIXEL:Record<Exclude<ExportFormat,'webm'>,number>={sequence:0.35,gif:0.12,apng:0.3,sheet:0.3};
/** Rough size guess for the readout: a flat per-pixel factor for image formats, a bitrate for WebM. The real size depends on the artwork. */
export function estimateBytes(format:ExportFormat,width:number,height:number,frames:number,fps:number,quality:WebmQuality='medium'):number{
 const px=width*height;
 if(format==='webm')return Math.round(px*fps*WEBM_BPP[quality]/8*(frames/Math.max(1,fps)));
 return Math.round(px*frames*BYTES_PER_PIXEL[format]);
}
/** Plan for one format. Never throws: invalid input is reported in `problems` and the plan falls back to safe values. */
export function exportPlan(comp:Composition,format:ExportFormat,s:ExportSettings):ExportPlan{
 const problems=settingsProblems(s);const ok=(k:ExportProblem)=>!problems.includes(k);
 const scale=ok('scale')?s.scale:100;
 const width=Math.max(1,Math.round(comp.width*scale/100)),height=Math.max(1,Math.round(comp.height*scale/100));
 const total=Math.max(1,Math.round(comp.duration*comp.fps.num/(comp.fps.den*TICKS_PER_SECOND)));
 let inTick=comp.workArea.in,outTick=comp.workArea.out,from=Math.max(0,tickToFrame(inTick-comp.start,comp.fps)),to=Math.max(from,tickToFrame(outTick-comp.start,comp.fps)-1);
 if(ok('range')&&(s.from!==null||s.to!==null)){
  const f=s.from??from,l=s.to??Math.max(f,to);
  if(l<f||l>=total)problems.push('range');
  else{from=f;to=l;inTick=comp.start+frameToTick(f,comp.fps);outTick=comp.start+frameToTick(l+1,comp.fps);}
 }
 const rate=ok('fps')&&s.fps!==null?{num:s.fps,den:1}:{num:comp.fps.num,den:comp.fps.den};
 const first=tickToFrame(inTick,rate);
 const frames=Math.max(1,Math.round((outTick-inTick)*rate.num/(rate.den*TICKS_PER_SECOND)));
 const derived:Composition={...comp,fps:rate,workArea:{in:frameToTick(first,rate),out:frameToTick(first+frames,rate)}};
 const seconds=frames*rate.den/rate.num;
 if(comp.width*comp.height>EXPORT_LIMITS.maxPixels||width*height>EXPORT_LIMITS.maxPixels||width>16384||height>16384)problems.push('size');
 if(frames>EXPORT_LIMITS.maxFrames||(format==='gif'&&frames>EXPORT_LIMITS.gifFrames))problems.push('frames');
 if(format==='sheet'){try{sheetPlan(frames,width,height,s.columns??undefined);}catch(x){if(x instanceof SheetError)problems.push(x.code==='too-large'?'size':'frames');else throw x;}}
 if(format==='webm'&&seconds>EXPORT_LIMITS.webmSeconds)problems.push('seconds');
 const est=estimateBytes(format,width,height,frames,rate.num/rate.den,ok('quality')?s.quality:'medium');
 return {format,width,height,frames,seconds,fps:rate,from,to,comp:derived,estimateBytes:est,overCap:est>EXPORT_LIMITS.maxBytes,problems:[...new Set(problems)]};
}
const MSG:Record<ExportProblem,string>={size:'The output size is above the supported limit. Lower the scale.',frames:'Too many frames for this format. Shorten the range or lower the frame rate.',seconds:`WebM records in real time and is limited to ${EXPORT_LIMITS.webmSeconds} seconds. Shorten the range.`,range:'The frame range is not valid for this composition.',scale:`Scale must be a whole number from ${SCALE_MIN} to ${SCALE_MAX} percent.`,fps:`Frame rate must be a whole number from 1 to ${FPS_MAX}.`,columns:'Sprite sheet columns must be a whole number from 1 to 256.',name:'The file name must be at most 80 characters.',number:'The first frame number must be a whole number from 0 to 99999.',background:'The background colour must look like #ffffff.',quality:'WebM quality must be low, medium or high.'};
export const problemMessage=(p:ExportProblem)=>MSG[p];
