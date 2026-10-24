import type {ExportSchema,ExportValues} from '../export/schema';
/** PDF options for the shared Advanced Export dialog (AE2). Three real outputs: the editable copy (what Save copy writes), a flattened print copy and a flattened screen copy. */
export type PdfOutput='edited'|'print'|'screen';
export const PDF_OUTPUTS:readonly PdfOutput[]=['edited','print','screen'];
export interface PdfAdvancedOptions{name:string;output:PdfOutput;dpi:number;quality:number;title:string;author:string;subject:string;keywords:string}
export const PDF_EXPORT_DEFAULTS:PdfAdvancedOptions={name:'',output:'edited',dpi:120,quality:78,title:'',author:'',subject:'',keywords:''};
export const PDF_DPI_MIN=72,PDF_DPI_MAX=300,PDF_QUALITY_MIN=10,PDF_QUALITY_MAX=100;
export interface PdfExportContext{
 /** The document bytes are loaded. */
 hasBytes:boolean;
 /** Signed, encrypted or XFA: flattening is refused for these. */
 protectedDoc:boolean;
 /** A canvas and PDF renderer are available (needed for the screen copy). */
 canvas:boolean;
}
export const pdfFlattens=(o:PdfOutput)=>o!=='edited';
export function valuesToPdfOptions(values:ExportValues):PdfAdvancedOptions{
 const d=PDF_EXPORT_DEFAULTS;const str=(k:string,f:string)=>typeof values[k]==='string'?values[k] as string:f;
 const num=(k:string,f:number)=>{const v=typeof values[k]==='string'&&values[k]!==''?Number(values[k]):values[k];return typeof v==='number'&&Number.isFinite(v)?Math.round(v):f;};
 const out=str('output',d.output);
 return {name:str('name','').trim(),output:(PDF_OUTPUTS as readonly string[]).includes(out)?out as PdfOutput:'edited',dpi:num('dpi',d.dpi),quality:num('quality',d.quality),
  title:str('title','').trim(),author:str('author','').trim(),subject:str('subject','').trim(),keywords:str('keywords','').trim()};
}
export const pdfOptionsToValues=(o:PdfAdvancedOptions):ExportValues=>({...o});
const SUFFIX:Record<PdfOutput,string>={edited:'-edited',print:'-flattened',screen:'-screen'};
/** File stem without path characters or a .pdf extension. */
export const pdfFileStem=(name:string)=>name.replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|]+/g,'_').trim().slice(0,120);
/** Suggested file name for the save dialog: the chosen name plus a suffix that says what kind of copy it is. */
export const pdfExportFileName=(o:PdfAdvancedOptions)=>`${pdfFileStem(o.name)||'document'}${SUFFIX[o.output]}.pdf`;
/** Options for the flatten pipeline: only the fields the user filled in, so the rest of the metadata stays as it is. */
export function pdfPipelineOptions(o:PdfAdvancedOptions){
 const keywords=o.keywords.split(',').map(s=>s.trim()).filter(Boolean);
 return {dpi:o.dpi,quality:o.quality/100,metadata:{...(o.title?{title:o.title}:{}),...(o.author?{author:o.author}:{}),...(o.subject?{subject:o.subject}:{}),...(keywords.length?{keywords}:{})}};
}
export function pdfExportSchema(ctx:PdfExportContext):ExportSchema{
 const out=(v:ExportValues)=>valuesToPdfOptions(v).output;
 return {studio:'pdf',defaults:pdfOptionsToValues(PDF_EXPORT_DEFAULTS),validate:v=>{
  const o=valuesToPdfOptions(v);
  if(!ctx.hasBytes)return 'export.error.empty';
  if(!pdfFileStem(o.name))return 'export.error.name';
  if(pdfFlattens(o.output)&&ctx.protectedDoc)return 'export.error.pdfProtected';
  if(o.output==='screen'&&!ctx.canvas)return 'export.error.pdfCanvas';
  if(o.output==='screen'&&(o.dpi<PDF_DPI_MIN||o.dpi>PDF_DPI_MAX||o.quality<PDF_QUALITY_MIN||o.quality>PDF_QUALITY_MAX))return 'export.error.pdfScreen';
  return null;
 },fields:[
  {id:'output',type:'select',labelKey:'export.format',options:[{value:'edited',labelKey:'export.pdf.edited'},{value:'print',labelKey:'export.pdf.print'},{value:'screen',labelKey:'export.pdf.screen'}]},
  {id:'name',type:'text',labelKey:'export.name',maxLength:120},
  {id:'dpi',type:'number',labelKey:'export.pdf.dpi',group:'export.group.output',min:PDF_DPI_MIN,max:PDF_DPI_MAX,step:1,unit:'dpi',visibleWhen:v=>out(v)==='screen'},
  {id:'quality',type:'number',labelKey:'export.quality',group:'export.group.output',min:PDF_QUALITY_MIN,max:PDF_QUALITY_MAX,step:1,unit:'%',visibleWhen:v=>out(v)==='screen'},
  {id:'title',type:'text',labelKey:'export.meta.title',group:'export.group.metadata',maxLength:200,visibleWhen:v=>out(v)!=='edited'},
  {id:'author',type:'text',labelKey:'export.meta.author',group:'export.group.metadata',maxLength:200,visibleWhen:v=>out(v)!=='edited'},
  {id:'subject',type:'text',labelKey:'export.pdf.subject',group:'export.group.metadata',maxLength:200,visibleWhen:v=>out(v)!=='edited'},
  {id:'keywords',type:'text',labelKey:'export.pdf.keywords',group:'export.group.metadata',maxLength:400,visibleWhen:v=>out(v)!=='edited'},
 ]};
}
