import type {ExportSchema,ExportValues} from '../export/schema';
/** Documents options for the shared Advanced Export dialog (AE1). The engine writes docx only, so the options are the file name and Dublin Core metadata. */
export interface DocumentsAdvancedOptions{name:string;metaTitle:string;metaAuthor:string;metaDescription:string}
export const DOCUMENTS_EXPORT_DEFAULTS:DocumentsAdvancedOptions={name:'',metaTitle:'',metaAuthor:'',metaDescription:''};
export function valuesToDocumentsOptions(values:ExportValues):DocumentsAdvancedOptions{
 const str=(k:string)=>typeof values[k]==='string'?values[k] as string:'';
 return {name:str('name').trim(),metaTitle:str('metaTitle'),metaAuthor:str('metaAuthor'),metaDescription:str('metaDescription')};
}
export function documentsOptionsToValues(o:DocumentsAdvancedOptions):ExportValues{return {...o};}
export function documentsExportSchema():ExportSchema{
 return {studio:'documents',defaults:documentsOptionsToValues(DOCUMENTS_EXPORT_DEFAULTS),validate:v=>valuesToDocumentsOptions(v).name?null:'export.error.name',fields:[
  {id:'name',type:'text',labelKey:'export.name',testId:'documents-export-name',maxLength:115},
  {id:'metaTitle',type:'text',labelKey:'export.meta.title',group:'export.group.metadata',maxLength:512},
  {id:'metaAuthor',type:'text',labelKey:'export.meta.author',group:'export.group.metadata',maxLength:512},
  {id:'metaDescription',type:'text',labelKey:'export.meta.description',group:'export.group.metadata',maxLength:512},
 ]};
}
