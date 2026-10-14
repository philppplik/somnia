import type {InterfaceDocument,InterfaceExportSetting} from './schema';
import {exportInterfaceLayerSVG,frameExportPNG,assertInterfaceRasterSize} from './export';
export {addExportSetting,updateExportSetting,removeExportSetting,interfaceExportList,validateExportSettings,MAX_EXPORT_SETTINGS,MAX_EXPORT_LIST,type ExportListEntry} from './exportSettingsCore';
const slug=(name:string)=>name.replace(/[^a-z0-9-_]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase()||'layer';
/** Raster exports reuse the guarded PNG pipeline (size caps, abort, timeout) with a WebP encoder option. */
export async function exportInterfaceAsset(doc:InterfaceDocument,nodeId:string,setting:InterfaceExportSetting,options:{signal?:AbortSignal}={}):Promise<{blob:Blob;filename:string}>{if(!['png','svg','webp'].includes(setting.format)||![1,2].includes(setting.scale)||setting.format==='svg'&&setting.scale!==1)throw Error('Unsupported export setting.');const n=doc.nodes.find(n=>n.id===nodeId);if(!n)throw Error('Unknown layer.');const name=slug(n.name);
 if(setting.format==='svg'){const svg=exportInterfaceLayerSVG(doc,nodeId);return {blob:new Blob([svg.svg],{type:'image/svg+xml'}),filename:`${name}.svg`};}
 const svg=exportInterfaceLayerSVG(doc,nodeId);const job={documentId:doc.id,revision:doc.revision,frameId:nodeId,name:n.name,width:svg.width,height:svg.height,svg:svg.svg,warnings:[]};assertInterfaceRasterSize(job,setting.scale);const blob=await frameExportPNG(job,setting.scale,{signal:options.signal,format:setting.format});return {blob,filename:`${name}@${setting.scale}x.${setting.format}`};}
