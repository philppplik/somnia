import type {ExportSchema,ExportValues} from '../export/schema';
/** Slides options for the shared Advanced Export dialog (AE1). The engine writes pptx only, so the options are the file name and Dublin Core metadata. */
export interface SlidesAdvancedOptions{name:string;metaTitle:string;metaAuthor:string;metaDescription:string}
export const SLIDES_EXPORT_DEFAULTS:SlidesAdvancedOptions={name:'',metaTitle:'',metaAuthor:'',metaDescription:''};
export function valuesToSlidesOptions(values:ExportValues):SlidesAdvancedOptions{
 const str=(k:string)=>typeof values[k]==='string'?values[k] as string:'';
 return {name:str('name').trim(),metaTitle:str('metaTitle'),metaAuthor:str('metaAuthor'),metaDescription:str('metaDescription')};
}
export function slidesOptionsToValues(o:SlidesAdvancedOptions):ExportValues{return {...o};}
export function slidesExportSchema():ExportSchema{
 return {studio:'slides',defaults:slidesOptionsToValues(SLIDES_EXPORT_DEFAULTS),validate:v=>valuesToSlidesOptions(v).name?null:'export.error.name',fields:[
  {id:'name',type:'text',labelKey:'export.name',testId:'slides-export-name',maxLength:120},
  {id:'metaTitle',type:'text',labelKey:'export.meta.title',group:'export.group.metadata',maxLength:512},
  {id:'metaAuthor',type:'text',labelKey:'export.meta.author',group:'export.group.metadata',maxLength:512},
  {id:'metaDescription',type:'text',labelKey:'export.meta.description',group:'export.group.metadata',maxLength:512},
 ]};
}
