import {strToU8,zipSync} from 'fflate';
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
