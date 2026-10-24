import type {ExportSchema,ExportValues} from '../export/schema';
/** Interface options for the shared Advanced Export dialog (AE1): file name, frame scope, format/scale preset and SVG title/description metadata. */
export interface InterfaceAdvancedOptions{name:string;scope:'selected'|'page';preset:string;metaTitle:string;metaDescription:string}
export const INTERFACE_EXPORT_DEFAULTS:InterfaceAdvancedOptions={name:'',scope:'selected',preset:'svg',metaTitle:'',metaDescription:''};
const PRESETS=new Set(['svg','png1x','png2x','png3x']);
export function valuesToInterfaceOptions(values:ExportValues):InterfaceAdvancedOptions{
 const str=(k:string)=>typeof values[k]==='string'?values[k] as string:'';
 return {name:str('name').trim(),scope:str('scope')==='page'?'page':'selected',preset:PRESETS.has(str('preset'))?str('preset'):'svg',metaTitle:str('metaTitle'),metaDescription:str('metaDescription')};
}
export function interfaceOptionsToValues(o:InterfaceAdvancedOptions):ExportValues{return {...o};}
const escapeXml=(v:string)=>v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
/** Inserts SVG title/description metadata right after the opening <svg> tag; no-op for non-SVG or empty input. */
export function injectInterfaceSvgMeta(svg:string,title:string,description:string):string{
 if(!title&&!description)return svg;
 const open=svg.indexOf('>');if(!svg.startsWith('<svg')||open<0)return svg;
 return `${svg.slice(0,open+1)}${title?`<title>${escapeXml(title)}</title>`:''}${description?`<desc>${escapeXml(description)}</desc>`:''}${svg.slice(open+1)}`;
}
export function interfaceExportSchema():ExportSchema{
 return {studio:'interface',defaults:interfaceOptionsToValues(INTERFACE_EXPORT_DEFAULTS),validate:v=>valuesToInterfaceOptions(v).name?null:'export.error.name',fields:[
  {id:'name',type:'text',labelKey:'export.name',testId:'interface-export-name',maxLength:120},
  {id:'scope',type:'select',labelKey:'interface.exportScope',testId:'interface-export-scope',options:[{value:'selected',labelKey:'interface.selectedFrames'},{value:'page',labelKey:'interface.pageFrames'}]},
  {id:'preset',type:'select',labelKey:'interface.exportPreset',testId:'interface-export-preset',options:[{value:'svg',labelKey:'interface.export.format.svg'},{value:'png1x',labelKey:'interface.export.format.png1x'},{value:'png2x',labelKey:'interface.export.format.png2x'},{value:'png3x',labelKey:'interface.export.format.png3x'}]},
  {id:'metaTitle',type:'text',labelKey:'export.meta.title',group:'export.group.metadata',maxLength:512,visibleWhen:v=>v.preset==='svg'},
  {id:'metaDescription',type:'text',labelKey:'export.meta.description',group:'export.group.metadata',maxLength:512,visibleWhen:v=>v.preset==='svg'},
 ]};
}
