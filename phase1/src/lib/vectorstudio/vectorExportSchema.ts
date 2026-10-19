import type {ExportSchema,ExportValues} from '../export/schema';
import {exportDimensions} from '../export/dimensions';
import {EXPORT_AREAS,PADDING_LIMITS,type ExportArea} from './exportArea';
/** Vector options for the shared Advanced Export dialog (AE2): SVG or PNG, export area, exact size, background and metadata. */
export type VectorExportFormat='svg'|'png';
export interface VectorAdvancedOptions{
 format:VectorExportFormat;name:string;area:ExportArea;padding:number;
 mode:'percent'|'exact';scalePercent:number;width:number;height:number;lockAspect:boolean;
 background:'transparent'|'white';metaTitle:string;metaAuthor:string;metaCopyright:string;metaDescription:string;
}
export const VECTOR_EXPORT_DEFAULTS:VectorAdvancedOptions={
 format:'svg',name:'',area:'page',padding:0,mode:'percent',scalePercent:100,width:0,height:0,lockAspect:true,
 background:'transparent',metaTitle:'',metaAuthor:'',metaCopyright:'',metaDescription:'',
};
/** The rasteriser clamps every side to this many pixels; the dialog refuses larger requests instead of exporting a different size. */
export const VECTOR_PNG_MAX_SIDE=8192;
export function valuesToVectorOptions(values:ExportValues):VectorAdvancedOptions{
 const d=VECTOR_EXPORT_DEFAULTS;const str=(k:string,f:string)=>typeof values[k]==='string'?values[k] as string:f;
 const num=(k:string,f:number)=>typeof values[k]==='number'&&Number.isFinite(values[k] as number)?values[k] as number:f;
 const area=str('area',d.area);
 return {
  format:str('format',d.format)==='png'?'png':'svg',name:str('name',d.name).trim(),
  area:(EXPORT_AREAS as readonly string[]).includes(area)?area as ExportArea:d.area,
  padding:num('padding',d.padding),mode:str('mode',d.mode)==='exact'?'exact':'percent',
  scalePercent:num('scalePercent',d.scalePercent),width:num('width',d.width),height:num('height',d.height),
  lockAspect:typeof values.lockAspect==='boolean'?values.lockAspect as boolean:d.lockAspect,
  background:str('background',d.background)==='white'?'white':'transparent',
  metaTitle:str('metaTitle',''),metaAuthor:str('metaAuthor',''),metaCopyright:str('metaCopyright',''),metaDescription:str('metaDescription',''),
 };
}
export function vectorOptionsToValues(o:VectorAdvancedOptions):ExportValues{return {...o};}
/** Pixel size of a PNG export for an area of the given size; throws on invalid input. */
export function vectorPngSize(o:VectorAdvancedOptions,area:{width:number;height:number}):{width:number;height:number}{
 const r=exportDimensions({sourceWidth:area.width,sourceHeight:area.height,mode:o.mode,percent:o.scalePercent,width:o.width,height:o.height,lockAspect:o.lockAspect});
 if(r.width>VECTOR_PNG_MAX_SIDE||r.height>VECTOR_PNG_MAX_SIDE)throw Error('PNG side limit.');
 return r;
}
/** `areaSize` returns the size of the chosen export area, or null when it cannot be exported (empty selection, nothing visible). */
export function vectorExportSchema(areaSize:(area:ExportArea,padding:number)=>{width:number;height:number}|null):ExportSchema{
 return {studio:'vector',defaults:vectorOptionsToValues(VECTOR_EXPORT_DEFAULTS),validate:values=>{
  const o=valuesToVectorOptions(values);
  if(!o.name)return 'export.error.name';
  if(o.padding<PADDING_LIMITS.min||o.padding>PADDING_LIMITS.max)return 'export.error.dims';
  const a=areaSize(o.area,o.padding);if(!a)return 'export.error.area';
  if(o.format==='png'){try{vectorPngSize(o,a);}catch{return 'export.error.dims';}}
  return null;
 },fields:[
  {id:'format',type:'select',labelKey:'export.format',options:[{value:'svg',labelKey:'SVG'},{value:'png',labelKey:'PNG'}]},
  {id:'name',type:'text',labelKey:'export.name',maxLength:120},
  {id:'area',type:'select',labelKey:'vector.shell.exportArea',group:'export.group.area',options:EXPORT_AREAS.map(a=>({value:a,labelKey:'vector.shell.area.'+a}))},
  {id:'padding',type:'number',labelKey:'vector.shell.padding',group:'export.group.area',min:PADDING_LIMITS.min,max:PADDING_LIMITS.max,step:1,visibleWhen:v=>v.area!=='page'},
  {id:'mode',type:'select',labelKey:'export.mode',group:'export.group.size',options:[{value:'percent',labelKey:'export.scalePercent'},{value:'exact',labelKey:'export.modeExact'}],visibleWhen:v=>v.format==='png'},
  {id:'scalePercent',type:'number',labelKey:'export.scalePercent',group:'export.group.size',min:10,max:800,step:1,unit:'%',visibleWhen:v=>v.format==='png'&&v.mode!=='exact'},
  {id:'width',type:'number',labelKey:'export.width',group:'export.group.size',min:1,max:VECTOR_PNG_MAX_SIDE,step:1,unit:'px',visibleWhen:v=>v.format==='png'&&v.mode==='exact'},
  {id:'height',type:'number',labelKey:'export.height',group:'export.group.size',min:1,max:VECTOR_PNG_MAX_SIDE,step:1,unit:'px',visibleWhen:v=>v.format==='png'&&v.mode==='exact'},
  {id:'lockAspect',type:'checkbox',labelKey:'export.lockAspect',group:'export.group.size',visibleWhen:v=>v.format==='png'&&v.mode==='exact'},
  {id:'background',type:'select',labelKey:'vector.shell.pngBackground',group:'export.group.output',options:[{value:'transparent',labelKey:'vector.shell.bg.transparent'},{value:'white',labelKey:'vector.shell.bg.white'}],visibleWhen:v=>v.format==='png'},
  {id:'metaTitle',type:'text',labelKey:'export.meta.title',group:'export.group.metadata',maxLength:512},
  {id:'metaAuthor',type:'text',labelKey:'export.meta.author',group:'export.group.metadata',maxLength:512,visibleWhen:v=>v.format==='png'},
  {id:'metaCopyright',type:'text',labelKey:'export.meta.copyright',group:'export.group.metadata',maxLength:512,visibleWhen:v=>v.format==='png'},
  {id:'metaDescription',type:'text',labelKey:'export.meta.description',group:'export.group.metadata',maxLength:512},
 ]};
}
