import type {ExportSchema,ExportValues} from '../export/schema';
/** Design options for the shared Advanced Export dialog (AE1): scope, file name and SVG title/description metadata. */
export interface DesignAdvancedOptions{name:string;scope:'current'|'all';metaTitle:string;metaDescription:string}
export const DESIGN_EXPORT_DEFAULTS:DesignAdvancedOptions={name:'',scope:'current',metaTitle:'',metaDescription:''};
export function valuesToDesignOptions(values:ExportValues):DesignAdvancedOptions{
 const str=(k:string)=>typeof values[k]==='string'?values[k] as string:'';
 return {name:str('name').trim(),scope:str('scope')==='all'?'all':'current',metaTitle:str('metaTitle'),metaDescription:str('metaDescription')};
}
export function designOptionsToValues(o:DesignAdvancedOptions):ExportValues{return {...o};}
export function designExportSchema():ExportSchema{
 return {studio:'design',defaults:designOptionsToValues(DESIGN_EXPORT_DEFAULTS),validate:v=>valuesToDesignOptions(v).name?null:'export.error.name',fields:[
  {id:'name',type:'text',labelKey:'export.name',testId:'design-export-name',maxLength:120},
  {id:'scope',type:'select',labelKey:'design.hero.scope',testId:'design-export-scope',options:[{value:'current',labelKey:'design.hero.current'},{value:'all',labelKey:'design.hero.all'}]},
  {id:'metaTitle',type:'text',labelKey:'export.meta.title',group:'export.group.metadata',maxLength:512},
  {id:'metaDescription',type:'text',labelKey:'export.meta.description',group:'export.group.metadata',maxLength:512},
 ]};
}
