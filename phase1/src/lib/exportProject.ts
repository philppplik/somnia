import {zipSync,strToU8} from 'fflate';
export function projectArchive(files:Readonly<Record<string,string>>){
 const entries:Record<string,Uint8Array>={};for(const [path,source] of Object.entries(files)){
  if(path.startsWith('/')||path.split('/').some(p=>p==='..'||!p)||path.includes('\\'))throw Error(`Unsafe export path: ${path}`);
  entries[path]=strToU8(source);
 }
 if(!Object.keys(entries).length)throw Error('No project files to export.');return zipSync(entries);
}
export function downloadProject(files:Readonly<Record<string,string>>,name:string){
 const bytes=projectArchive(files);const blob=new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'application/zip'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${name.replace(/[^\w-]/g,'_')||'somnia-project'}.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
