import {strToU8,zipSync} from 'fflate';
import {injectSvgMetadata} from '../export/svgMetadata';
import {exportArtboardSVG,type DesignDocument} from './model';
/** Safe, deterministic and unique names, including duplicate artboard names. No filesystem paths. */
export const exportName=(name:string)=>name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/^\.+|[. ]+$/g,'').slice(0,160)||'artboard';
export function artboardArchive(doc:DesignDocument):Uint8Array{
 const entries:Record<string,Uint8Array>={};
 doc.artboards.forEach((board,i)=>{entries[`${i+1}-${exportName(board.name)}.svg`]=strToU8(exportArtboardSVG(board));});
 return zipSync(entries);
}
export function downloadArtboards(doc:DesignDocument):string{
 const name=exportName(doc.name)+'-artboards.zip',url=URL.createObjectURL(new Blob([new Uint8Array(artboardArchive(doc)).buffer],{type:'application/zip'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return name;
}
export {injectSvgMetadata} from '../export/svgMetadata';
/** Advanced export (AE1): dialog-chosen base name plus SVG title/description. Scope 'all' zips every artboard with the same metadata applied. */
export function downloadArtboardsAdvanced(doc:DesignDocument,scope:'current'|'all',artboardId:string,base:string,meta:{title:string;description:string}):string{
 if(scope==='all'){
  const entries:Record<string,Uint8Array>={};
  doc.artboards.forEach((b,i)=>{entries[`${i+1}-${exportName(b.name)}.svg`]=strToU8(injectSvgMetadata(exportArtboardSVG(b),meta));});
  const name=exportName(base)+'-artboards.zip';
  const url=URL.createObjectURL(new Blob([new Uint8Array(zipSync(entries)).buffer],{type:'application/zip'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return name;
 }
 const board=doc.artboards.find(b=>b.id===artboardId)??doc.artboards[0];
 if(!board)throw Error('No artboard to export.');
 const name=exportName(base)+'.svg';
 const url=URL.createObjectURL(new Blob([injectSvgMetadata(exportArtboardSVG(board),meta)],{type:'image/svg+xml'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return name;
}
