import type {ExportSchema,ExportValues} from '../export/schema';
import {exportDimensions} from '../export/dimensions';
/** Photos options for the shared Advanced Export dialog (AE1). */
export type PhotoExportFormat='png'|'jpeg'|'webp';
export type PhotoExportProfile='srgb'|'display-p3'|'grayscale';
export interface PhotoAdvancedOptions{
 format:PhotoExportFormat;name:string;mode:'percent'|'exact';scalePercent:number;width:number;height:number;lockAspect:boolean;
 quality:number;profile:PhotoExportProfile;metaTitle:string;metaAuthor:string;metaCopyright:string;metaDescription:string;
}
export const PHOTO_EXPORT_DEFAULTS:PhotoAdvancedOptions={
 format:'png',name:'',mode:'percent',scalePercent:100,width:0,height:0,lockAspect:true,
 quality:90,profile:'srgb',metaTitle:'',metaAuthor:'',metaCopyright:'',metaDescription:'',
};
const META=[['metaTitle','title'],['metaAuthor','author'],['metaCopyright','copyright'],['metaDescription','description']] as const;
export function photoExportMetadata(o:Pick<PhotoAdvancedOptions,'metaTitle'|'metaAuthor'|'metaCopyright'|'metaDescription'>){
 return {title:o.metaTitle,author:o.metaAuthor,copyright:o.metaCopyright,description:o.metaDescription};
}
export function valuesToPhotoOptions(values:ExportValues):PhotoAdvancedOptions{
 const d=PHOTO_EXPORT_DEFAULTS;const str=(k:string,f:string)=>typeof values[k]==='string'?values[k] as string:f;
 const num=(k:string,f:number)=>typeof values[k]==='number'&&Number.isFinite(values[k] as number)?values[k] as number:f;
 const format=str('format',d.format);const profile=str('profile',d.profile);
 return {
  format:(['png','jpeg','webp'].includes(format)?format:d.format) as PhotoExportFormat,
  name:str('name',d.name).trim(),
  mode:str('mode',d.mode)==='exact'?'exact':'percent',
  scalePercent:num('scalePercent',d.scalePercent),width:num('width',d.width),height:num('height',d.height),
  lockAspect:typeof values.lockAspect==='boolean'?values.lockAspect as boolean:d.lockAspect,
  quality:Math.min(100,Math.max(1,Math.round(num('quality',d.quality)))),
  profile:(['srgb','display-p3','grayscale'].includes(profile)?profile:d.profile) as PhotoExportProfile,
  metaTitle:str('metaTitle',''),metaAuthor:str('metaAuthor',''),metaCopyright:str('metaCopyright',''),metaDescription:str('metaDescription',''),
 };
}
export function photoOptionsToValues(o:PhotoAdvancedOptions):ExportValues{return {...o};}
export function photoExportSchema(source:{width:number;height:number}):ExportSchema{
 return {studio:'photos',defaults:photoOptionsToValues(PHOTO_EXPORT_DEFAULTS),validate:values=>{
  const o=valuesToPhotoOptions(values);
  if(!o.name)return 'export.error.name';
  try{exportDimensions({sourceWidth:source.width,sourceHeight:source.height,mode:o.mode,percent:o.scalePercent,width:o.width,height:o.height,lockAspect:o.lockAspect});}catch{return 'export.error.dims';}
  return null;
 },fields:[
  {id:'format',type:'select',labelKey:'export.format',testId:'photos-export-format',options:[{value:'png',labelKey:'PNG'},{value:'jpeg',labelKey:'JPEG'},{value:'webp',labelKey:'WebP'}]},
  {id:'name',type:'text',labelKey:'export.name',maxLength:120},
  {id:'mode',type:'select',labelKey:'export.mode',group:'export.group.size',options:[{value:'percent',labelKey:'export.scalePercent'},{value:'exact',labelKey:'export.modeExact'}]},
  {id:'scalePercent',type:'number',labelKey:'export.scalePercent',group:'export.group.size',min:1,max:800,step:1,unit:'%',visibleWhen:v=>v.mode!=='exact'},
  {id:'width',type:'number',labelKey:'export.width',group:'export.group.size',min:1,max:16384,step:1,unit:'px',visibleWhen:v=>v.mode==='exact'},
  {id:'height',type:'number',labelKey:'export.height',group:'export.group.size',min:1,max:16384,step:1,unit:'px',visibleWhen:v=>v.mode==='exact'},
  {id:'lockAspect',type:'checkbox',labelKey:'export.lockAspect',group:'export.group.size',visibleWhen:v=>v.mode==='exact'},
  {id:'quality',type:'range',labelKey:'export.quality',group:'export.group.output',min:1,max:100,step:1,visibleWhen:v=>v.format!=='png'},
  {id:'profile',type:'select',labelKey:'export.profile',group:'export.group.output',options:[{value:'srgb',labelKey:'export.profile.srgb'},{value:'display-p3',labelKey:'export.profile.display-p3'},{value:'grayscale',labelKey:'export.profile.grayscale'}]},
  ...META.map(([id,labelKey])=>({id,type:'text' as const,labelKey:`export.meta.${labelKey}`,group:'export.group.metadata',maxLength:512})),
 ]};
}
