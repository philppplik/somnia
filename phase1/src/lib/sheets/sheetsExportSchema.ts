import type {ExportSchema,ExportValues} from '../export/schema';
/** Sheets options for the shared Advanced Export dialog (AE1). The engine writes xlsx only, so the options are the file name and Dublin Core metadata. */
export interface SheetsAdvancedOptions{name:string;metaTitle:string;metaAuthor:string;metaDescription:string}
export const SHEETS_EXPORT_DEFAULTS:SheetsAdvancedOptions={name:'',metaTitle:'',metaAuthor:'',metaDescription:''};
export function valuesToSheetsOptions(values:ExportValues):SheetsAdvancedOptions{
 const str=(k:string)=>typeof values[k]==='string'?values[k] as string:'';
 return {name:str('name').trim(),metaTitle:str('metaTitle'),metaAuthor:str('metaAuthor'),metaDescription:str('metaDescription')};
}
export function sheetsOptionsToValues(o:SheetsAdvancedOptions):ExportValues{return {...o};}
export function sheetsExportSchema():ExportSchema{
 return {studio:'sheets',defaults:sheetsOptionsToValues(SHEETS_EXPORT_DEFAULTS),validate:v=>valuesToSheetsOptions(v).name?null:'export.error.name',fields:[
  {id:'name',type:'text',labelKey:'export.name',testId:'sheets-export-name',maxLength:120},
  {id:'metaTitle',type:'text',labelKey:'export.meta.title',group:'export.group.metadata',maxLength:512},
  {id:'metaAuthor',type:'text',labelKey:'export.meta.author',group:'export.group.metadata',maxLength:512},
  {id:'metaDescription',type:'text',labelKey:'export.meta.description',group:'export.group.metadata',maxLength:512},
 ]};
}
